// Static Host half test: imports the real lib/index.js (a standard Cordis
// plugin) and exercises it with a stubbed ctx, validating the tool
// registration, the survey building, and the execute flow end-to-end against
// the real `defineTool` from @deepseek-ai/dsh-tools.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as plugin from '../lib/index.js';

function makeCtx() {
  const registered = [];
  let askImpl;
  const ctx = {
    tools: {
      register: (tool) => {
        registered.push(tool);
        return () => {};
      },
    },
    userQuestions: {
      ask: async (request) => {
        if (!askImpl) throw new Error('no ask stub installed');
        return askImpl(request);
      },
    },
  };
  return { ctx, registered, setAsk: (impl) => { askImpl = impl; } };
}

test('plugin surface matches the cordis plugin convention', () => {
  assert.equal(plugin.name, 'dsh-tech-stack-survey');
  assert.ok(Array.isArray(plugin.inject));
  assert.ok(plugin.inject.includes('tools'), 'injects the tools registry');
  assert.ok(plugin.inject.includes('userQuestions'), 'injects the userQuestions seam');
  assert.equal(typeof plugin.apply, 'function');
});

test('apply() registers the design_stack_survey tool', () => {
  const { ctx, registered } = makeCtx();
  plugin.apply(ctx);
  assert.equal(registered.length, 1);
  const tool = registered[0];
  assert.equal(tool.name, 'design_stack_survey');
  assert.equal(typeof tool.description, 'string');
  assert.ok(tool.description.length > 40);
  // defineTool normalizes the parameters DSL into a JSON-schema form:
  // required:true moves to the root `required` array, enum stays on the property.
  assert.equal(tool.parameters.type, 'object');
  assert.ok(tool.parameters.required.includes('project_description'));
  assert.ok(Array.isArray(tool.parameters.properties.project_type.enum));
  assert.ok(tool.parameters.properties.project_type.enum.length >= 5);
  assert.equal(tool.output.schema.type, 'object');
  assert.equal(typeof tool.execute, 'function');
  assert.equal(typeof tool.output.render, 'function');
});

test('execute() asks an adaptive question batch and returns answers', async () => {
  const { ctx, registered, setAsk } = makeCtx();
  plugin.apply(ctx);
  const tool = registered[0];
  let captured;
  setAsk(async (request) => {
    captured = request;
    return { answers: request.questions.map((q) => ({ id: q.id, selected: [q.options[1].label] })) };
  });
  const exec = { agent: { id: 'session-x' } };
  const result = await tool.execute(
    { project_description: '一个给团队用的项目管理看板', project_type: 'web', complexity: 5, prompt_detail: 1 },
    exec,
  );

  assert.equal(captured.questions.length, 5, 'complexity 5 + detail 1 -> 5 questions');
  for (const q of captured.questions) {
    assert.ok(q.id.startsWith('dss_stack_'), `id ${q.id} carries the dss_stack_ prefix`);
    assert.equal(q.options.length, 3, 'exactly 3 options per question');
    assert.ok(q.options.every((o) => typeof o.label === 'string' && o.label.length > 0));
    assert.ok(q.options.every((o) => o.description.includes('\n\n')), 'option description carries scenario + details');
  }
  assert.deepEqual(Object.keys(captured.questions[0]).sort(), ['detail', 'header', 'id', 'options', 'question']);
  assert.ok(captured.agent && captured.agent.id === 'session-x', 'live agent is passed through');
  assert.ok(Object.prototype.hasOwnProperty.call(captured, 'signal'));

  assert.equal(result.answers.length, 5);
  assert.ok(result.answers.every((a) => typeof a.question === 'string' && a.question.length > 0));
  assert.ok(result.answers.every((a) => Array.isArray(a.selected) && a.selected.length === 1));
});

test('question count is clamped to 2..5 and type routing falls back to other', async () => {
  const { ctx, registered, setAsk } = makeCtx();
  plugin.apply(ctx);
  const tool = registered[0];
  setAsk(async (request) => ({ answers: request.questions.map((q) => ({ id: q.id, selected: [] })) }));

  const small = await tool.execute({ project_description: 'todo cli', project_type: 'cli', complexity: 1, prompt_detail: 3 }, {});
  assert.equal(small.answers.length, 2, 'complexity 1 + detail 3 -> 2 questions');
  assert.equal(small.answers[0].id, 'dss_stack_backend', 'cli routing starts with backend');

  const unknown = await tool.execute({ project_description: 'whatever' }, {});
  assert.equal(unknown.answers.length, 3, 'omitted project_type falls back to other routing');
  assert.equal(unknown.answers[0].id, 'dss_stack_frontend');
});

test('custom answers pass through and render produces content blocks', async () => {
  const { ctx, registered, setAsk } = makeCtx();
  plugin.apply(ctx);
  const tool = registered[0];
  setAsk(async () => ({ answers: [{ id: 'dss_stack_frontend', selected: [], custom: 'Angular' }] }));

  const custom = await tool.execute({ project_description: 'x', project_type: 'web', complexity: 1, prompt_detail: 3 }, {});
  assert.equal(custom.answers[0].custom, 'Angular');
  assert.deepEqual(custom.answers[0].selected, []);

  const blocks = tool.output.render({}, {
    answers: [{ id: 'dss_stack_frontend', question: 'Web 前端采用什么技术栈？', selected: ['Vue 3 + Vite'] }],
  });
  assert.ok(Array.isArray(blocks) && blocks.length === 1 && typeof blocks[0].text === 'string');
  assert.ok(blocks[0].text.includes('Vue 3 + Vite'));
});
