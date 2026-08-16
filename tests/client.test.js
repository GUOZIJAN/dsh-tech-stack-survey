// Static Client half test: evaluates lib/client.js (the lazy-CJS
// __ModuleLoader__ bundle) in a Node VM with a stubbed module table, then
// verifies the exported plugin surface and its composer registration.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const bundleCode = readFileSync(join(here, '..', 'lib', 'client.js'), 'utf8');

function evaluateBundle() {
  let handoff = null;
  const fakeReact = { useState: (v) => [v, () => {}], createElement: () => ({}) };
  const documentStub = {
    querySelector: () => null,
    createElement: () => ({ dataset: {}, remove() {} }),
    head: { append() {} },
  };
  const sandbox = {
    window: { __ModuleLoader__: { load: (h) => { handoff = h; } } },
    document: documentStub,
    require: (spec) => {
      if (spec === 'react') return fakeReact;
      throw new Error(`unexpected require: ${spec}`);
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(bundleCode, sandbox);
  assert.ok(handoff, 'bundle registers via window.__ModuleLoader__.load');
  const mod = handoff.factory(sandbox.require);
  return { handoff, mod };
}

test('bundle id matches the package name and exports the plugin surface', () => {
  const { handoff, mod } = evaluateBundle();
  assert.equal(handoff.id, 'dsh-tech-stack-survey');
  assert.deepEqual(Object.keys(mod).sort(), ['apply', 'inject']);
  // spread into host-realm arrays: cross-realm prototypes differ, so
  // deepStrictEqual on the vm-owned values would report a false mismatch.
  assert.deepEqual([...mod.inject], ['slots', 'locale']);
  assert.equal(typeof mod.apply, 'function');
});

test('apply() registers locale dictionaries and the conversation.composer entry', () => {
  const { mod } = evaluateBundle();
  const effects = [];
  let localeRegistered = null;
  let slotInject = null;
  let slotReg = null;
  const ctx = {
    effect: (fn, label) => {
      effects.push(label);
      const disposer = fn();
      if (typeof disposer === 'function') disposer();
    },
    locale: { register: (ns, dicts) => { localeRegistered = { ns, dicts }; return () => {}; } },
    slots: {
      inject: (name, register) => { slotInject = { name, register }; },
      register: (options, component) => { slotReg = { options, component }; return () => {}; },
    },
  };
  mod.apply(ctx);

  assert.deepEqual(effects.sort(), ['dss: dictionaries', 'dss: styles']);
  assert.equal(localeRegistered.ns, 'dss');
  assert.deepEqual(Object.keys(localeRegistered.dicts).sort(), ['en', 'zh']);
  assert.equal(slotInject.name, 'conversation.composer');

  slotInject.register(); // run the register thunk
  assert.equal(slotReg.options.name, 'conversation.composer');
  assert.equal(slotReg.options.priority, -1, 'claims survey interactions before the built-in composer');
  assert.equal(slotReg.options.locale, 'dss');
  assert.equal(typeof slotReg.options.select, 'function');
  assert.equal(typeof slotReg.component, 'function');
});

test('select() claims only dss_stack_ question batches', () => {
  const { mod } = evaluateBundle();
  let select;
  let registerThunk;
  const ctx = {
    effect: () => {},
    locale: { register: () => () => {} },
    slots: {
      inject: (_name, register) => { registerThunk = register; },
      register: (options) => { select = options.select; return () => {}; },
    },
  };
  mod.apply(ctx);
  assert.equal(typeof registerThunk, 'function');
  registerThunk(); // the composer entry's register thunk runs on chain mount

  const survey = select({ interactions: [{ kind: 'question', payload: { questions: [{ id: 'dss_stack_frontend' }, { id: 'dss_stack_backend' }] } }] });
  assert.ok(survey && survey.kind === 'question', 'claims a dss_stack_ batch');

  const ordinary = select({ interactions: [{ kind: 'question', payload: { questions: [{ id: 'plain-q-1' }] } }] });
  assert.equal(ordinary, null, 'leaves ordinary question flows to the built-in composer');

  const empty = select({ interactions: [] });
  assert.equal(empty, null);
});
