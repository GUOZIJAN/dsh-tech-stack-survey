// Unit test for the Host half of dsh-tech-stack-survey.
// Runs host.js (a cordis_define code body) inside a Node VM with stubbed
// harness/ctx, then exercises the question builder and the tool execute flow.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const hostBody = fs.readFileSync(path.join(__dirname, '..', 'host.js'), 'utf8');

let registeredTool = null;
const harnessStub = {
  defineTool: (options) => options, // return the definition as-is
  registerTool: (_ctx, tool) => {
    registeredTool = tool;
    return () => {};
  },
};

// ctx stub: effect() invokes the callback; userQuestions is filled per test.
const ctxStub = {
  effect: (fn) => (typeof fn === 'function' ? fn() : undefined),
  userQuestions: undefined,
};

const sandbox = { harness: harnessStub, __DSH_TECH_STACK_TEST__: true };
sandbox.globalThis = sandbox;

let failures = 0;
function check(name, cond, extra) {
  if (cond) {
    console.log(`  ok  ${name}`);
  } else {
    failures += 1;
    console.error(`FAIL  ${name}${extra !== undefined ? `\n      ${extra}` : ''}`);
  }
}

// --- Load the body as a function and get the plugin -------------------------
let plugin;
try {
  const wrapped = new vm.Script(`(function (harness, ctx, __DSH_TECH_STACK_TEST__) {\n${hostBody}\n})`).runInNewContext(sandbox);
  plugin = wrapped(harnessStub, ctxStub, true);
  check('host body evaluates and returns a plugin', typeof plugin === 'object' && plugin !== null);
} catch (err) {
  check('host body evaluates and returns a plugin', false, String(err && err.stack || err));
  process.exit(1);
}

// --- Plugin surface ----------------------------------------------------------
check('plugin declares userQuestions inject', Array.isArray(plugin.inject) && plugin.inject.includes('userQuestions'));
check('plugin has apply()', typeof plugin.apply === 'function');

// --- Internals via the test hook --------------------------------------------
const dss = sandbox.__dssTest;
check('test hook exposed internals', dss && typeof dss.buildSurvey === 'function' && typeof dss.questionCount === 'function');

if (!dss) {
  console.error('internals unavailable; aborting');
  process.exit(1);
}

// --- questionCount bounds -----------------------------------------------------
for (let c = 1; c <= 5; c += 1) {
  for (let d = 1; d <= 3; d += 1) {
    const n = dss.questionCount(c, d);
    check(`questionCount(c=${c}, d=${d}) in [2,5] (got ${n})`, n >= 2 && n <= 5);
  }
}
check('high complexity + low detail -> 5 questions', dss.questionCount(5, 1) === 5, `got ${dss.questionCount(5, 1)}`);
check('low complexity + high detail -> 2 questions', dss.questionCount(1, 3) === 2, `got ${dss.questionCount(1, 3)}`);
check('default complexity=3 detail=2 -> 3 questions', dss.questionCount(3, 2) === 3, `got ${dss.questionCount(3, 2)}`);

// --- buildSurvey structure ----------------------------------------------------
const survey = dss.buildSurvey('一个给团队用的项目管理看板', 'web', 5, 1);
check('survey has 5 questions for (5,1) web', survey.length === 5, `got ${survey.length}`);
check('first question carries survey marker', survey[0].survey === 'tech-stack');
check('first question carries surveyTitle', survey[0].surveyTitle === '项目技术选型');
check('first question carries detail (project description)', typeof survey[0].detail === 'string' && survey[0].detail.length > 0);
check('every question has exactly 3 options', survey.every((q) => Array.isArray(q.options) && q.options.length === 3));
check(
  'every option has label + description + details',
  survey.every((q) => q.options.every((o) => typeof o.label === 'string' && o.label.length > 0
    && typeof o.description === 'string' && o.description.length > 0
    && typeof o.details === 'string' && o.details.length > 0)),
);
check('question ids are unique', new Set(survey.map((q) => q.id)).size === survey.length);
check('ids are stable stack_<dim>', survey.every((q) => /^stack_[a-z]+$/.test(q.id)));

const small = dss.buildSurvey('todo cli', 'cli', 1, 3);
check('cli + low complexity -> 2 questions', small.length === 2, `got ${small.length}`);
check('cli survey covers backend first', small[0].id === 'stack_backend');

const unknown = dss.buildSurvey('whatever', 'nope', 3, 2);
check('unknown type falls back to other routing', unknown.length === 3 && unknown[0].id === 'stack_frontend', `got ${unknown.map((q) => q.id).join(',')}`);

// --- Apply: tool registration --------------------------------------------------
plugin.apply(ctxStub);
check('apply registered a tool', registeredTool !== null);
check('tool name is design_stack_survey', registeredTool && registeredTool.name === 'design_stack_survey');
check('tool has a description', registeredTool && typeof registeredTool.description === 'string' && registeredTool.description.length > 40);
check('tool declares project_description required', registeredTool && registeredTool.parameters && registeredTool.parameters.project_description && registeredTool.parameters.project_description.required === true);
check('tool declares project_type enum', registeredTool && Array.isArray(registeredTool.parameters.project_type.enum) && registeredTool.parameters.project_type.enum.length >= 5);
check('tool declares output schema', registeredTool && registeredTool.output && registeredTool.output.schema && registeredTool.output.schema.type === 'object');
check('tool has execute()', registeredTool && typeof registeredTool.execute === 'function');
check('tool has output.render()', registeredTool && typeof registeredTool.output.render === 'function');

// --- execute flow with a mocked ask() ------------------------------------------
(async () => {
  const captured = {};
  ctxStub.userQuestions = {
    ask: async (request) => {
      captured.request = request;
      return {
        answers: request.questions.map((q) => ({ id: q.id, selected: [q.options[1].label] })),
      };
    },
  };
  const exec = { agent: { id: 'session-x' }, signal: undefined };
  const result = await registeredTool.execute({
    project_description: '一个给团队用的项目管理看板',
    project_type: 'web',
    complexity: 5,
    prompt_detail: 1,
  }, exec);

  check('ask() received all questions', Array.isArray(captured.request.questions) && captured.request.questions.length === 5);
  check('ask() received the live agent', captured.request.agent && captured.request.agent.id === 'session-x');
  check('ask() received signal key', Object.prototype.hasOwnProperty.call(captured.request, 'signal'));
  check('execute returns answers with question text', result.answers.length === 5 && result.answers.every((a) => typeof a.question === 'string' && a.question.length > 0));
  check('execute returns selected labels', result.answers.every((a) => Array.isArray(a.selected) && a.selected.length === 1 && typeof a.selected[0] === 'string'));

  // custom answer passthrough
  ctxStub.userQuestions.ask = async () => ({
    answers: [{ id: 'stack_frontend', selected: [], custom: 'Angular' }],
  });
  const custom = await registeredTool.execute({ project_description: 'x' }, exec);
  check('custom answer is passed through', custom.answers[0].custom === 'Angular' && custom.answers[0].selected.length === 0);

  // render
  const blocks = registeredTool.output.render({}, result);
  check('render returns content blocks', Array.isArray(blocks) && blocks.length === 1 && typeof blocks[0].text === 'string' && blocks[0].text.includes('→'));
  check('render mentions question text', blocks[0].text.includes(result.answers[0].question));

  if (failures === 0) console.log('\nALL CHECKS PASSED');
  else {
    console.error(`\n${failures} CHECK(S) FAILED`);
    process.exit(1);
  }
})().catch((err) => {
  console.error('test crashed:', err);
  process.exit(1);
});
