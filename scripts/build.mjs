// ============================================================================
// dsh-tech-stack-survey — twin generator (anti-drift)
// ----------------------------------------------------------------------------
// Generates the four install-mode files from the shared single sources of
// truth (shared/survey-core.js, shared/client-core.js) plus the small glue
// templates below. Edit the shared sources and re-run this script instead of
// hand-editing the twins:
//
//   node scripts/build.mjs           rewrite drifted files (default)
//   node scripts/build.mjs --check   fail (exit 1) when any twin has drifted
//
// tests/consistency.test.js runs the same generation and fails the suite on
// any drift, so the two install modes can never silently diverge again.
// ============================================================================

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const surveyCore = readFileSync(join(root, 'shared', 'survey-core.js'), 'utf8');
const clientCore = readFileSync(join(root, 'shared', 'client-core.js'), 'utf8');

// ---------------------------------------------------------------------------
// Dynamic Host twin — the exact body of `code.host` in cordis_define.
// ---------------------------------------------------------------------------
function dynamicHost(core) {
  return [
    '// ============================================================================',
    '// dsh-tech-stack-survey — Host half (dynamic install)',
    '// ----------------------------------------------------------------------------',
    '// GENERATED FILE — DO NOT EDIT.',
    '// Single source of truth: shared/survey-core.js + the dynamic glue below.',
    '// Regenerate with `npm run build`; tests/consistency.test.js fails on drift.',
    '//',
    '// This file is the exact body of `code.host` in `cordis_define`:',
    '//   cordis_define(plugin, name, purpose, { host: <this body>, client: <client.js body> })',
    '//',
    '// Registers one dynamic model Tool, `design_stack_survey`. The model calls it',
    '// when the user asks to design/build a project without specifying a complete',
    '// tech stack: the tool builds 2-5 questions (3 options each) from the shared',
    '// knowledge bank, asks them via `ctx.userQuestions.ask()` (blocking until the',
    '// human answers in the browser UI), then returns the chosen stacks. The',
    '// sandbox provides `harness.defineTool` / `harness.registerTool`.',
    '// ============================================================================',
    '',
    core,
    '',
    '// Test hook (harmless in production): exposes internals when the sandbox',
    '// defines __DSH_TECH_STACK_TEST__. Kept BEFORE the return so it is reachable.',
    "if (typeof __DSH_TECH_STACK_TEST__ !== 'undefined') {",
    '  globalThis.__dssTest = { BANK, ORDER_BY_TYPE, buildSurvey, questionCount };',
    '}',
    '',
    '// ---------------------------------------------------------------------------',
    '// Plugin definition',
    '// ---------------------------------------------------------------------------',
    'return {',
    "  inject: ['userQuestions'],",
    '  apply(ctx) {',
    '    const tool = harness.defineTool(makeToolOptions(ctx));',
    "    ctx.effect(() => harness.registerTool(ctx, tool), 'tech-stack-survey: register design_stack_survey tool');",
    '  },',
    '};',
    '',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Static Host twin — the permanent-install ESM package entry.
// ---------------------------------------------------------------------------
function staticHost(core) {
  return [
    '// ============================================================================',
    '// dsh-tech-stack-survey — Host half (static / permanent install)',
    '// ----------------------------------------------------------------------------',
    '// GENERATED FILE — DO NOT EDIT.',
    '// Single source of truth: shared/survey-core.js + the static glue below.',
    '// Regenerate with `npm run build`; tests/consistency.test.js fails on drift.',
    '//',
    '// Static Cordis plugin twin of the dynamic `host.js` body: imports the real',
    '// `defineTool` from @deepseek-ai/dsh-tools and registers through the injected',
    '// `ctx.tools` service — exactly the idiom of the shipped host tool packages',
    '// (e.g. @deepseek-ai/dsh-tool-ask-user). Both twins inline the SAME',
    '// shared/survey-core.js, so knowledge-bank edits apply to both install modes.',
    '//',
    '// Registered tool: `design_stack_survey`. The model calls it when the user',
    '// asks to design/build a project without a complete tech stack. The tool',
    '// builds 2-5 questions (exactly 3 options each) from a built-in knowledge',
    '// bank, asks them via `ctx.userQuestions.ask()` (blocks until the human',
    '// answers in the browser UI), then returns the chosen stacks.',
    '// ============================================================================',
    '',
    'import { defineTool } from "@deepseek-ai/dsh-tools";',
    '',
    core,
    '',
    '// ---------------------------------------------------------------------------',
    '// Plugin definition',
    '// ---------------------------------------------------------------------------',
    'const name = "dsh-tech-stack-survey";',
    '// `tools` for ctx.tools.register (the shipped host-tool idiom), plus the',
    '// `userQuestions` capability seam this tool blocks on.',
    'const inject = ["tools", "userQuestions"];',
    '',
    'function apply(ctx) {',
    '  ctx.tools.register(defineTool(makeToolOptions(ctx)));',
    '}',
    '',
    'export { apply, inject, name };',
    '',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Dynamic Client twin — the exact body of `code.client` in cordis_define.
// ---------------------------------------------------------------------------
function dynamicClient(core) {
  return [
    '// ============================================================================',
    '// dsh-tech-stack-survey — Client half (dynamic install)',
    '// ----------------------------------------------------------------------------',
    '// GENERATED FILE — DO NOT EDIT.',
    '// Single source of truth: shared/client-core.js + the dynamic glue below.',
    '// Regenerate with `npm run build`; tests/consistency.test.js fails on drift.',
    '//',
    '// This file is the exact body of `code.client` in `cordis_define`:',
    '//   cordis_define(plugin, name, purpose, { host: <host.js body>, client: <this body> })',
    '//',
    '// Registers a custom composer into the `conversation.composer` chain that',
    '// claims pending `dss_stack_` question batches (priority -1 + id-prefix',
    '// selector) and renders one question at a time with hover tooltips, back',
    '// navigation, and a single submit resolving the Host-side `ask()`. The',
    '// sandbox provides `React` and `styles` builtins for the shared core.',
    '// ============================================================================',
    '',
    core,
    '',
    '// ---------------------------------------------------------------------------',
    '// Plugin definition',
    '// ---------------------------------------------------------------------------',
    'return {',
    '  inject,',
    '  apply,',
    '};',
    '',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Static Client twin — the lazy-CJS __ModuleLoader__ bundle.
// ---------------------------------------------------------------------------
function staticClient(core) {
  return [
    '// ============================================================================',
    '// dsh-tech-stack-survey — Client half (static / permanent install)',
    '// ----------------------------------------------------------------------------',
    '// GENERATED FILE — DO NOT EDIT.',
    '// Single source of truth: shared/client-core.js + the static glue below.',
    '// Regenerate with `npm run build`; tests/consistency.test.js fails on drift.',
    '//',
    '// Static browser bundle twin of the dynamic `client.js` body. Shipped',
    '// client packages are lazy-CJS bundles registered via',
    '// `window.__ModuleLoader__.load({ id, factory })`; the module table\'s `require`',
    '// answers `react` (a shell seed word), so the component uses plain',
    '// `React.createElement` exactly like the dynamic body. `styles.insert` is',
    '// replaced by the static style-tag convention (data-plugin / data-plugin-css',
    '// attributes, duplicate-guarded), and the plugin object is exported as',
    '// `{ inject, apply }` like @deepseek-ai/dsh-client-ui-user-questions.',
    '// Both twins inline the SAME shared/client-core.js.',
    '// ============================================================================',
    '',
    'window.__ModuleLoader__.load({',
    '  id: "dsh-tech-stack-survey",',
    '  factory: (require) => {',
    '    var module = { exports: {} };',
    '    var exports = module.exports;',
    '    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });',
    '    const React = require("react");',
    '',
    '    // Static style-tag bookkeeping (data-plugin / data-plugin-css attributes;',
    '    // duplicate-guarded so HMR reloads do not stack tags). The dynamic sandbox',
    '    // provides `styles` as a builtin instead.',
    '    const CSS_TAG_ID = "dsh-tech-stack-survey/styles";',
    '    const styles = {',
    '      insert(cssText) {',
    '        if (typeof document === "undefined") return () => {};',
    '        if (document.querySelector(`style[data-plugin-css=${JSON.stringify(CSS_TAG_ID)}]`) !== null) return () => {};',
    '        const tag = document.createElement("style");',
    '        tag.dataset.plugin = "dsh-tech-stack-survey";',
    '        tag.dataset.pluginCss = CSS_TAG_ID;',
    '        tag.textContent = cssText;',
    '        document.head.append(tag);',
    '        return () => { tag.remove(); };',
    '      },',
    '    };',
    '',
    core,
    '',
    '    exports.inject = inject;',
    '    exports.apply = apply;',
    '    return module.exports;',
    '  },',
    '});',
    '',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Public surface: tests import `generate()` to compare against the twins.
// ---------------------------------------------------------------------------
export function generate() {
  return {
    host: dynamicHost(surveyCore),
    client: dynamicClient(clientCore),
    libIndex: staticHost(surveyCore),
    libClient: staticClient(clientCore),
  };
}

// ---------------------------------------------------------------------------
// CLI: rewrite drifted files, or fail on drift with --check.
// ---------------------------------------------------------------------------
function main() {
  const check = process.argv.includes('--check');
  const gen = generate();
  const targets = [
    ['host.js', gen.host],
    ['client.js', gen.client],
    ['lib/index.js', gen.libIndex],
    ['lib/client.js', gen.libClient],
  ];
  const norm = (text) => String(text).replace(/\r\n/g, '\n');
  let drifted = 0;
  for (const [rel, wanted] of targets) {
    const current = norm(readFileSync(join(root, rel), 'utf8'));
    const match = current === norm(wanted);
    if (!match) drifted += 1;
    console.log(`${match ? 'ok   ' : 'DRIFT'} ${rel}`);
    if (!check && !match) writeFileSync(join(root, rel), norm(wanted));
  }
  if (check) {
    if (drifted > 0) {
      console.error(`\n${drifted} generated file(s) drifted from shared/*. Fix by running: npm run build`);
      process.exit(1);
    }
    console.log('\nAll generated twins match the shared sources.');
  } else if (drifted > 0) {
    console.log(`\nRewrote ${drifted} drifted file(s).`);
  } else {
    console.log('\nNothing to do — all twins are up to date.');
  }
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invoked) main();
