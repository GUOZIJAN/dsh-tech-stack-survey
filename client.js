// ============================================================================
// dsh-tech-stack-survey — Client half
// ----------------------------------------------------------------------------
// A dynamic Cordis plugin for DeepSeek Harness (DSH).
//
// This file is the exact body of `code.client` in `cordis_define`:
//   cordis_define(plugin, name, purpose, { host: <host.js body>, client: <this body> })
//
// What it does
//   Registers a custom composer into the `conversation.composer` chain. While
//   the model's `design_stack_survey` tool is waiting for answers, the pending
//   question interaction carries questions whose ids start with `dss_stack_`
//   (the wire protocol strips unknown fields, so the marker lives in the id
//   prefix); this composer claims those (and only those — priority -1, and
//   the selector verifies the prefix, so ordinary ask_user_question flows
//   keep using the built-in composer) and renders:
//     - all questions in one card;
//     - exactly 3 options per question: stack name + the scenario it fits
//       (first paragraph of `option.description`);
//     - a hover tooltip on every option showing the full description
//       (`scenario\n\ndetails`, both carried inside the allowed
//       `option.description` field);
//     - one submit button that answers every question at once.
//   Submitting calls `wait.respond(...)` exactly like the built-in composer,
//   which resolves the Host-side `ctx.userQuestions.ask()` promise and lets the
//   model continue with the chosen stack in the same turn.
// ============================================================================

const SURVEY_ID_PREFIX = 'dss_stack_';
const NS = 'dss';

// ---------------------------------------------------------------------------
// Locale dictionaries (chrome strings; the knowledge bank itself is Chinese).
// ---------------------------------------------------------------------------
const dicts = {
  zh: {
    title: '项目技术选型',
    subtitle: '开始设计前，先确认几个关键技术选择',
    hint: '将鼠标悬停在选项上，可查看该技术栈的详细介绍',
    answered: '已选择',
    cancel: '放弃问卷',
    submit: '提交并开始设计',
    submitting: '提交中…',
    errorRejected: '提交被拒绝，请重试',
  },
  en: {
    title: 'Tech Stack Survey',
    subtitle: 'A few choices before we start designing',
    hint: 'Hover over an option to see details about that stack',
    answered: 'Answered',
    cancel: 'Dismiss',
    submit: 'Submit & start designing',
    submitting: 'Submitting…',
    errorRejected: 'Submission rejected, please retry',
  },
};

// ---------------------------------------------------------------------------
// Chain selector: claim only question interactions created by this plugin.
// The built-in composer (priority 0) keeps everything else.
// ---------------------------------------------------------------------------
function selectSurvey(owner) {
  const interactions = owner && Array.isArray(owner.interactions) ? owner.interactions : [];
  const question = interactions.find((item) => item && item.kind === 'question');
  if (!question || !question.payload || !Array.isArray(question.payload.questions)) return null;
  const questions = question.payload.questions;
  if (questions.length === 0) return null;
  for (const item of questions) {
    if (!item || typeof item.id !== 'string' || item.id.indexOf(SURVEY_ID_PREFIX) !== 0) return null;
  }
  return question;
}

/** The one-line scenario is the first paragraph of the full description. */
function scenarioOf(option) {
  const text = String((option && option.description) || '');
  const split = text.indexOf('\n\n');
  return split === -1 ? text : text.slice(0, split);
}

// ---------------------------------------------------------------------------
// The survey composer component. Plain React, no JSX.
// ---------------------------------------------------------------------------
function SurveyComposer(props) {
  const t = props.t || ((key) => key);
  const wait = props.matched;
  const questions = wait && wait.payload && Array.isArray(wait.payload.questions)
    ? wait.payload.questions
    : [];
  const [selected, setSelected] = React.useState({});
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);

  if (questions.length === 0) return null;

  const answeredCount = questions.filter((q) => selected[q.id]).length;
  const allAnswered = answeredCount === questions.length;

  const choose = (qid, label) => {
    setSelected((prev) => ({ ...prev, [qid]: label }));
    setError(null);
  };

  const settle = (request) => {
    setBusy(true);
    setError(null);
    request().catch((cause) => {
      setBusy(false);
      setError(cause instanceof Error ? cause.message : String(cause));
    });
  };

  const submit = () => {
    if (!allAnswered || busy) return;
    settle(() => wait.respond({
      ok: true,
      value: {
        sessionId: wait.sessionId,
        answer: {
          answers: questions.map((q) => ({ id: q.id, selected: [selected[q.id]] })),
        },
      },
    }).then((receipt) => {
      if (!receipt || !receipt.accepted) {
        setBusy(false);
        setError(receipt ? String(receipt.reason) : t('errorRejected'));
      }
    }));
  };

  const cancel = () => {
    if (busy) return;
    settle(() => wait.respond({
      ok: false,
      error: { code: 'cancelled', message: 'the user closed the tech-stack survey', details: {} },
    }).then((receipt) => {
      if (!receipt || !receipt.accepted) {
        setBusy(false);
        setError(receipt ? String(receipt.reason) : t('errorRejected'));
      }
    }));
  };

  return React.createElement(
    'div',
    { className: 'dss-frame', 'data-question-key': wait.key },
    React.createElement(
      'section',
      { className: 'dss-card', 'aria-label': t('title') },
      React.createElement(
        'header',
        { className: 'dss-header' },
        React.createElement(
          'div',
          { className: 'dss-heading' },
          React.createElement('div', { className: 'dss-eyebrow' }, t('title')),
          React.createElement('h2', { className: 'dss-title' }, t('subtitle')),
          React.createElement('div', { className: 'dss-hint' }, t('hint')),
        ),
        React.createElement(
          'button',
          {
            type: 'button',
            className: 'dss-cancel',
            'aria-label': t('cancel'),
            title: t('cancel'),
            disabled: busy,
            onClick: cancel,
          },
          '✕',
        ),
      ),
      React.createElement(
        'div',
        { className: 'dss-body', 'data-dss-scroll': true },
        questions.map((q, qi) => React.createElement(
          'div',
          { className: 'dss-question', key: q.id },
          React.createElement(
            'div',
            { className: 'dss-qhead' },
            React.createElement('span', { className: 'dss-qnum', 'aria-hidden': 'true' }, String(qi + 1)),
            React.createElement(
              'div',
              { className: 'dss-qtext' },
              React.createElement('div', { className: 'dss-qtitle' }, q.question),
              qi === 0 && q.detail
                ? React.createElement('div', { className: 'dss-qdetail' }, q.detail)
                : null,
            ),
          ),
          React.createElement(
            'div',
            { className: 'dss-options', role: 'radiogroup', 'aria-label': q.question },
            (q.options || []).map((opt, oi) => {
              const isSelected = selected[q.id] === opt.label;
              const full = String((opt && opt.description) || '');
              const scenario = scenarioOf(opt);
              return React.createElement(
                'button',
                {
                  type: 'button',
                  key: `${opt.label}-${String(oi)}`,
                  className: isSelected ? 'dss-opt dss-opt-selected' : 'dss-opt',
                  role: 'radio',
                  'aria-checked': isSelected,
                  'aria-label': opt.label,
                  disabled: busy,
                  onClick: () => choose(q.id, opt.label),
                },
                React.createElement(
                  'span',
                  { className: 'dss-radio', 'aria-hidden': 'true' },
                  isSelected ? '●' : '',
                ),
                React.createElement(
                  'span',
                  { className: 'dss-optcopy' },
                  React.createElement('span', { className: 'dss-optlabel' }, opt.label),
                  scenario
                    ? React.createElement('span', { className: 'dss-optdesc' }, scenario)
                    : null,
                ),
                full
                  ? React.createElement('span', { className: 'dss-tip', role: 'tooltip' }, full)
                  : null,
              );
            }),
          ),
        )),
      ),
      React.createElement(
        'footer',
        { className: 'dss-footer' },
        React.createElement(
          'div',
          { className: 'dss-progress' },
          t('answered'),
          ' ',
          String(answeredCount),
          ' / ',
          String(questions.length),
        ),
        React.createElement('div', { className: 'dss-feedback', role: 'status' }, error || null),
        React.createElement(
          'div',
          { className: 'dss-actions' },
          React.createElement(
            'button',
            { type: 'button', className: 'dss-btn dss-btn-ghost', disabled: busy, onClick: cancel },
            t('cancel'),
          ),
          React.createElement(
            'button',
            {
              type: 'button',
              className: 'dss-btn dss-btn-primary',
              disabled: busy || !allAnswered,
              onClick: submit,
            },
            busy ? t('submitting') : t('submit'),
          ),
        ),
      ),
    ),
  );
}

// ---------------------------------------------------------------------------
// Package-owned styles (theme-token based; cleaned up when the run stops).
// ---------------------------------------------------------------------------
const css = `
.dss-frame{display:flex;justify-content:center;padding:6px calc(var(--dsh-composer-side-clearance) + 16px) 10px}
.dss-card{width:100%;max-width:var(--dsh-chat-content-width);border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-specific-input-major);box-shadow:var(--dsw-shadow-lv2);color:var(--dsw-alias-label-primary);border-radius:20px;flex-direction:column;padding:0 0 12px;display:flex}
.dss-card,.dss-card *{box-sizing:border-box}
.dss-header{flex-shrink:0;justify-content:space-between;align-items:flex-start;gap:16px;padding:18px 20px 0 24px;display:flex}
.dss-eyebrow{color:var(--dsw-alias-label-tertiary);margin-bottom:4px;font-size:11px;line-height:16px}
.dss-title{margin:0;font-size:16px;font-weight:500;line-height:22px}
.dss-hint{margin:4px 2px 0;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}
.dss-cancel{width:24px;height:24px;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:none;border-radius:999px;place-items:center;padding:0;font-size:14px;display:grid}
.dss-cancel:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dss-cancel:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}
.dss-body{flex-direction:column;gap:18px;padding:14px 20px 4px;display:flex}
.dss-question{flex-direction:column;gap:8px;display:flex}
.dss-qhead{align-items:flex-start;gap:10px;display:flex}
.dss-qnum{flex:none;width:22px;height:22px;color:#fff;background:var(--dsw-alias-brand-primary);border-radius:7px;place-items:center;margin-top:1px;font-size:12px;font-weight:600;display:grid}
.dss-qtitle{font-size:14px;font-weight:500;line-height:22px}
.dss-qdetail{color:var(--dsw-alias-label-secondary);margin-top:2px;white-space:pre-wrap;font-size:12px;line-height:18px}
.dss-options{flex-direction:column;gap:8px;margin-left:32px;display:flex}
.dss-opt{position:relative;width:100%;min-height:46px;color:inherit;text-align:left;cursor:pointer;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:12px;align-items:flex-start;gap:10px;padding:8px 12px;font:inherit;display:flex}
.dss-opt:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-border-l2)}
.dss-opt-selected,.dss-opt-selected:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-brand-primary)}
.dss-opt:disabled{cursor:default;opacity:.7}
.dss-radio{flex:none;width:16px;height:16px;color:var(--dsw-alias-brand-primary);border:1.5px solid var(--dsw-alias-border-l2);border-radius:50%;place-items:center;margin-top:3px;font-size:8px;display:grid}
.dss-opt-selected .dss-radio{border-color:var(--dsw-alias-brand-primary)}
.dss-optcopy{min-width:0;flex-direction:column;gap:2px;display:flex}
.dss-optlabel{font-size:13px;font-weight:500;line-height:20px}
.dss-optdesc{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}
.dss-tip{position:absolute;left:0;bottom:calc(100% + 8px);z-index:60;width:300px;max-width:70vw;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l2);box-shadow:var(--dsw-shadow-lv2);border-radius:10px;padding:10px 12px;pointer-events:none;white-space:pre-line;opacity:0;visibility:hidden;transition:opacity .12s ease;font-size:12px;line-height:18px}
.dss-opt:hover .dss-tip,.dss-opt:focus-within .dss-tip{opacity:1;visibility:visible}
.dss-footer{flex-shrink:0;align-items:center;gap:12px;padding:12px 20px 0;display:flex}
.dss-progress{color:var(--dsw-alias-label-secondary);white-space:nowrap;font-size:13px;font-weight:500;line-height:20px}
.dss-feedback{min-height:16px;flex:auto;color:var(--dsw-alias-state-error-primary);font-size:11px;line-height:16px}
.dss-actions{flex:none;align-items:center;gap:8px;display:flex}
.dss-btn{border:1px solid transparent;border-radius:10px;padding:6px 16px;cursor:pointer;font-size:13px;font-weight:500;line-height:20px}
.dss-btn:disabled{cursor:default;opacity:.55}
.dss-btn-ghost{color:var(--dsw-alias-label-secondary);background:0 0}
.dss-btn-ghost:hover:not(:disabled){color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}
.dss-btn-primary{color:#fff;background:var(--dsw-alias-brand-primary)}
.dss-btn-primary:hover:not(:disabled){filter:brightness(1.08)}
@media (prefers-reduced-motion:reduce){.dss-tip{transition:none}}
`;

// ---------------------------------------------------------------------------
// Plugin definition
// ---------------------------------------------------------------------------
return {
  inject: ['slots', 'locale'],
  apply(ctx) {
    ctx.effect(() => ctx.locale.register(NS, dicts), 'dss: dictionaries');
    ctx.effect(() => styles.insert(css), 'dss: styles');
    ctx.slots.inject('conversation.composer', () => ctx.slots.register(
      {
        name: 'conversation.composer',
        priority: -1,
        locale: NS,
        select: selectSurvey,
      },
      SurveyComposer,
    ));
  },
};
