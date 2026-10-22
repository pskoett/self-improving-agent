/**
 * Tests for the OpenClaw self-improvement hook.
 *
 * Run with: node --test hooks/openclaw/
 * (no dependencies; uses the built-in node:test runner)
 */

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { test, beforeEach, afterEach } = require('node:test');

const handler = require('./handler.js').default;

let workspaceDir;

beforeEach(async () => {
  workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'self-improvement-hook-'));
});

afterEach(async () => {
  await fs.rm(workspaceDir, { recursive: true, force: true });
});

function makeBootstrapEvent(overrides = {}) {
  return {
    type: 'agent',
    action: 'bootstrap',
    sessionKey: 'agent:main:whatsapp',
    timestamp: new Date('2026-07-04T12:00:00Z'),
    messages: [],
    context: { workspaceDir, bootstrapFiles: [] },
    ...overrides,
  };
}

function makeCommandEvent(action, sessionFile) {
  return {
    type: 'command',
    action,
    sessionKey: 'agent:main:whatsapp',
    timestamp: new Date('2026-07-04T12:00:00Z'),
    messages: [],
    context: {
      workspaceDir,
      commandSource: 'whatsapp',
      previousSessionEntry: { sessionId: 'abc123', sessionFile },
    },
  };
}

async function writeTranscript(lines) {
  const sessionsDir = path.join(workspaceDir, 'sessions');
  await fs.mkdir(sessionsDir, { recursive: true });
  const sessionFile = path.join(sessionsDir, 'abc123.jsonl');
  await fs.writeFile(sessionFile, lines.map((line) => JSON.stringify(line)).join('\n'));
  return sessionFile;
}

function toolResultLine(text) {
  return {
    type: 'message',
    message: { role: 'toolResult', content: [{ type: 'text', text }] },
  };
}

const errorsFile = () => path.join(workspaceDir, '.learnings', 'ERRORS.md');

test('bootstrap injects the reminder as a virtual file', async () => {
  const event = makeBootstrapEvent();
  await handler(event);

  assert.equal(event.context.bootstrapFiles.length, 1);
  const injected = event.context.bootstrapFiles[0];
  assert.equal(injected.path, 'SELF_IMPROVEMENT_REMINDER.md');
  assert.equal(injected.virtual, true);
  assert.match(injected.content, /## Self-Improvement Reminder/);
  assert.match(injected.content, /one-off and unpromoted learnings/);
  assert.match(injected.content, /Type determines how to check; rate determines when/);
  assert.match(injected.content, /unavailable\/conflicting evidence stays unresolved/);
  assert.doesNotMatch(injected.content, /Pending triage/);
});

test('bootstrap reminds without rewriting legacy history or validating claims', async () => {
  await fs.mkdir(path.join(workspaceDir, '.learnings'));
  const legacy = '# Errors\n\n## [ERR-20200101-OLD] old safeguard\n' +
    '**Status**: promoted\n- Source: openclaw-error-sweep\n' +
    '- Recurrence-Count: 2\n- Last-Seen: 2020-01-01\n**Promoted**: TOOLS.md\n';
  await fs.writeFile(errorsFile(), legacy);
  const event = makeBootstrapEvent();
  await handler(event);
  await handler(event);
  assert.equal(await fs.readFile(errorsFile(), 'utf-8'), legacy);
  assert.equal(event.context.bootstrapFiles.length, 1);
  assert.doesNotMatch(event.context.bootstrapFiles[0].content, /Pending triage/);
});

test('mixed sweep errors remain unclassified and unvalidated until triage', async () => {
  await fs.mkdir(path.join(workspaceDir, '.learnings'));
  const sessionFile = await writeTranscript([
    toolResultLine('npm ERR! code E404'),
    toolResultLine('Permission denied (publickey)'),
  ]);
  await handler(makeCommandEvent('reset', sessionFile));
  const first = await fs.readFile(errorsFile(), 'utf-8');
  assert.match(first, /- Pattern-Key: deps\.npm-error/);
  assert.match(first, /- Pattern-Key: fs\.permission-denied/);
  assert.match(first, /- Claim: unknown — possible unrelated errors; needs triage/);
  assert.match(first, /- Decay: unknown \/ unknown/);
  assert.match(first, /- Validation: pending/);
  assert.match(first, /- Evidence: none yet/);
  assert.match(first, /preserve this sweep/);
  assert.doesNotMatch(first, /- Decay: (dependency|reality|decision|relevance)/);
  assert.doesNotMatch(first, /- Validation: verified|Recurrence-Count:|delete it/);
  await handler(makeCommandEvent('reset', sessionFile));
  await handler(makeBootstrapEvent());
  assert.equal(await fs.readFile(errorsFile(), 'utf-8'), first);
});

test('bootstrap skips sub-agent sessions', async () => {
  const event = makeBootstrapEvent({ sessionKey: 'agent:main:subagent:xyz' });
  await handler(event);
  assert.equal(event.context.bootstrapFiles.length, 0);
});

test('bootstrap deduplicates a previously injected reminder', async () => {
  const event = makeBootstrapEvent();
  event.context.bootstrapFiles.push({
    name: 'SELF_IMPROVEMENT_REMINDER.md',
    path: 'SELF_IMPROVEMENT_REMINDER.md',
    content: '## Self-Improvement Reminder\n\nstale copy',
    virtual: true,
  });
  await handler(event);
  assert.equal(event.context.bootstrapFiles.length, 1);
});

test('session-end sweep appends detected errors to ERRORS.md', async () => {
  await fs.mkdir(path.join(workspaceDir, '.learnings'), { recursive: true });
  const sessionFile = await writeTranscript([
    { type: 'message', message: { role: 'user', content: 'run the build' } },
    toolResultLine('npm ERR! missing script: build\nbash: tsc: command not found'),
    { type: 'message', message: { role: 'assistant', content: 'Build is broken.' } },
  ]);

  await handler(makeCommandEvent('new', sessionFile));

  const content = await fs.readFile(errorsFile(), 'utf-8');
  assert.match(content, /^# Errors/);
  assert.match(content, /## \[ERR-20260704-[A-Z0-9]{3}\] openclaw_session_sweep/);
  assert.match(content, /npm ERR! missing script: build/);
  assert.match(content, /command not found/);
  assert.match(content, /Source: openclaw-error-sweep/);
  assert.match(content, /\*\*Status\*\*: pending/);
  assert.match(content, /- Pattern-Key: deps\.npm-error/);
  assert.match(content, /- Pattern-Key: shell\.command-not-found/);
});

test('sweep stamps the most specific Pattern-Key and dedupes keys', async () => {
  await fs.mkdir(path.join(workspaceDir, '.learnings'), { recursive: true });
  const sessionFile = await writeTranscript([
    // 'ModuleNotFoundError' must win over the generic 'Error:'/'Traceback' buckets
    toolResultLine("ModuleNotFoundError: No module named 'requests'"),
    toolResultLine('TypeError: cannot read properties of undefined (first)'),
    toolResultLine('TypeError: cannot read properties of undefined (second)'),
  ]);

  await handler(makeCommandEvent('new', sessionFile));

  const content = await fs.readFile(errorsFile(), 'utf-8');
  assert.match(content, /- Pattern-Key: deps\.module-not-found/);
  const typeErrorKeys = content.split('- Pattern-Key: runtime.type-error').length - 1;
  assert.equal(typeErrorKeys, 1);
  assert.doesNotMatch(content, /- Pattern-Key: runtime\.error/);
});

test('sweep does nothing when .learnings/ does not exist (opt-in gate)', async () => {
  const sessionFile = await writeTranscript([toolResultLine('fatal: not a git repository')]);
  await handler(makeCommandEvent('new', sessionFile));
  await assert.rejects(fs.access(errorsFile()));
});

test('sweep does nothing when the transcript has no errors', async () => {
  await fs.mkdir(path.join(workspaceDir, '.learnings'), { recursive: true });
  const sessionFile = await writeTranscript([
    { type: 'message', message: { role: 'assistant', content: 'All good!' } },
  ]);
  await handler(makeCommandEvent('new', sessionFile));
  await assert.rejects(fs.access(errorsFile()));
});

test('sweep never overwrites an existing ERRORS.md', async () => {
  await fs.mkdir(path.join(workspaceDir, '.learnings'), { recursive: true });
  await fs.writeFile(errorsFile(), '# Errors\n\nExisting notes.\n\n---\n');
  const sessionFile = await writeTranscript([toolResultLine('Error: connection refused')]);

  await handler(makeCommandEvent('reset', sessionFile));

  const content = await fs.readFile(errorsFile(), 'utf-8');
  assert.match(content, /Existing notes\./);
  assert.match(content, /Error: connection refused/);
});

test('sweep is idempotent for already-logged excerpts', async () => {
  await fs.mkdir(path.join(workspaceDir, '.learnings'), { recursive: true });
  const sessionFile = await writeTranscript([toolResultLine('Error: connection refused')]);

  await handler(makeCommandEvent('new', sessionFile));
  await handler(makeCommandEvent('new', sessionFile));

  const content = await fs.readFile(errorsFile(), 'utf-8');
  const occurrences = content.split('Error: connection refused').length - 1;
  assert.equal(occurrences, 1);
});

test('sweep redacts secrets and truncates long lines', async () => {
  await fs.mkdir(path.join(workspaceDir, '.learnings'), { recursive: true });
  const longTail = 'x'.repeat(300);
  // Fixture secret is assembled at runtime so the literal never appears in
  // this file and secret scanners don't flag it as an exposed credential.
  const fakeKey = ['sk', 'live', '1234567890'].join('-');
  const sessionFile = await writeTranscript([
    toolResultLine(
      `Error: request failed with api_key=${fakeKey} Bearer abc.def.ghi token: hunter2 ${longTail}`,
    ),
  ]);

  await handler(makeCommandEvent('new', sessionFile));

  const content = await fs.readFile(errorsFile(), 'utf-8');
  assert.doesNotMatch(content, new RegExp(fakeKey));
  assert.doesNotMatch(content, /hunter2/);
  assert.match(content, /\[REDACTED\]/);
  assert.doesNotMatch(content, /x{250}/);
});

test('sweep falls back to <workspace>/sessions/<sessionId>.jsonl', async () => {
  await fs.mkdir(path.join(workspaceDir, '.learnings'), { recursive: true });
  await writeTranscript([toolResultLine('Traceback (most recent call last):')]);

  await handler(makeCommandEvent('new', undefined));

  const content = await fs.readFile(errorsFile(), 'utf-8');
  assert.match(content, /Traceback/);
});

test('bootstrap surfaces pending sweep entries for triage', async () => {
  await fs.mkdir(path.join(workspaceDir, '.learnings'), { recursive: true });
  const sessionFile = await writeTranscript([toolResultLine('Permission denied (publickey)')]);
  await handler(makeCommandEvent('new', sessionFile));

  const event = makeBootstrapEvent();
  await handler(event);

  const injected = event.context.bootstrapFiles[0];
  assert.match(injected.content, /\*\*Pending triage:\*\* 1 auto-detected error entry/);
});

test('handler ignores unrelated events and malformed input', async () => {
  await handler(null);
  await handler({ type: 'gateway', action: 'startup', context: {} });
  await handler({ type: 'command', action: 'stop', context: { workspaceDir } });
  // A sweep with a missing transcript must not throw.
  await fs.mkdir(path.join(workspaceDir, '.learnings'), { recursive: true });
  await handler(makeCommandEvent('new', path.join(workspaceDir, 'sessions', 'missing.jsonl')));
  await assert.rejects(fs.access(errorsFile()));
});

// Model the host package contract, not an installed dependency. The copied hook
// lives outside the host's module ancestry, as it does in ~/.openclaw/hooks/.
async function runRuntimeSweep({ marker = true, optIn = true, mode = 'pages', legacyText } = {}) {
  const hostDir = path.join(workspaceDir, 'host');
  const hookDir = path.join(workspaceDir, 'hooks');
  await fs.mkdir(hostDir);
  await fs.mkdir(hookDir);
  if (optIn) await fs.mkdir(path.join(workspaceDir, '.learnings'));
  if (legacyText !== undefined) {
    await fs.mkdir(path.join(workspaceDir, 'sessions'));
    await fs.writeFile(path.join(workspaceDir, 'sessions', 'ended.jsonl'), JSON.stringify(toolResultLine(legacyText)));
  }
  await fs.copyFile(path.join(__dirname, 'handler.js'), path.join(hookDir, 'handler.cjs'));
  await fs.writeFile(path.join(hostDir, 'package.json'), JSON.stringify({
    name: 'openclaw', type: 'module',
    exports: { './plugin-sdk/session-transcript-runtime': './runtime.mjs' },
  }));
  await fs.writeFile(path.join(hostDir, 'runtime.mjs'), `
    const mode = ${JSON.stringify(mode)};
    export async function readSessionTranscriptRawDelta(params) {
      if (params.agentId !== 'other' || params.sessionId !== 'ended' ||
          params.sessionKey !== 'agent:other:chat' || params.storePath !== '/isolated/store:one.sqlite') {
        throw new Error('wrong session identity');
      }
      if (mode === 'unavailable') throw new Error('private transcript: do not log me');
      if (mode === 'reset' && params.cursor) return { kind: 'reset' };
      if (mode === 'missing') return { kind: 'missing' };
      if (mode === 'oversized' || (mode === 'retry-size' && params.maxBytes < 1500000)) {
        return { kind: 'page', events: [], cursor: params.cursor || 'start', hasMore: true,
          serializedBytes: 0, requiredBytes: mode === 'oversized' ? 100000000 : 1500000 };
      }
      if (mode === 'stalled') return { kind: 'page', events: [], cursor: 'stuck', hasMore: true, serializedBytes: 0 };
      const page = Number(params.cursor || 0);
      if (mode.endsWith('-limit')) {
        const count = mode === 'event-limit' ? params.maxEvents : 1;
        const limit = mode === 'event-limit' ? 2000 : mode === 'byte-limit' ? 8 : 16;
        return { kind: 'page', cursor: String(page + count), hasMore: true,
          serializedBytes: mode === 'byte-limit' ? params.maxBytes : 100,
          events: Array.from({ length: count }, (_, index) => ({ event: { message: { content:
            page + index === 0 ? 'Error: within scan budget' :
            page + index >= limit ? 'Error: beyond scan budget ' + (page + index) : 'all good'
          } } })) };
      }
      const text = mode === 'reset' ? 'Error: discarded generation' :
        page === 0 && mode !== 'retry-size' ? 'all good' : 'Error: ended session token=example-private-value';
      return { kind: 'page', events: [{ seq: page, event: {
        message: { role: 'toolResult', content: [{ type: 'text', text }] }
      } }], cursor: String(page + 1), hasMore: page === 0 && mode !== 'retry-size', serializedBytes: 100 };
    }
  `);
  const event = {
    type: 'command', action: 'reset', sessionKey: 'agent:other:chat',
    context: {
      workspaceDir, agentId: 'other', storePath: '/isolated/store:one.sqlite',
      previousSessionEntry: { sessionId: 'ended', ...(marker ? {
        sessionFile: 'sqlite:other:ended:/isolated/store:one.sqlite',
      } : {}) },
      sessionEntry: { sessionId: 'replacement' },
    },
  };
  await fs.writeFile(path.join(hostDir, 'run.mjs'), `
    import handler from '../hooks/handler.cjs';
    const event = ${JSON.stringify(event)};
    await handler.default(event);
    await handler.default(event);
  `);
  const result = await promisify(execFile)(process.execPath, [path.join(hostDir, 'run.mjs')], {
    env: { ...process.env, SELF_IMPROVEMENT_HOOK_DEBUG: '1' },
    timeout: 10000,
  });
  return { ...result, errors: await fs.readFile(errorsFile(), 'utf8').catch(() => '') };
}

for (const marker of [true, false]) {
  test(`runtime sweep reads the ended session across pages (${marker ? 'marker' : 'identity only'})`, async () => {
    const { errors } = await runRuntimeSweep({ marker });
    assert.match(errors, /Error: ended session token=\[REDACTED\]/);
    assert.doesNotMatch(errors, /example-private-value/);
    assert.equal(errors.split('Error: ended session').length - 1, 1);
  });
}

for (const legacyText of ['Error: legacy session', 'all good']) {
  test(`markerless context with agentId prefers the exact legacy transcript: ${legacyText}`, async () => {
    const { errors } = await runRuntimeSweep({ marker: false, legacyText });
    if (legacyText.startsWith('Error:')) assert.match(errors, /Error: legacy session/);
    else assert.equal(errors, '');
    assert.doesNotMatch(errors, /Error: ended session/);
  });
}

for (const mode of ['missing', 'reset']) {
  test(`explicit SQLite identity never falls back to stale JSONL on ${mode}`, async () => {
    const { errors } = await runRuntimeSweep({ mode, legacyText: 'Error: stale legacy session' });
    assert.equal(errors, '');
  });
}

test('runtime sweep remains opt-in', async () => {
  const { errors, stderr } = await runRuntimeSweep({ optIn: false, mode: 'unavailable' });
  assert.equal(errors, '');
  assert.equal(stderr, '');
});

test('runtime sweep retries an oversized page within its byte budget', async () => {
  const { errors } = await runRuntimeSweep({ mode: 'retry-size' });
  assert.match(errors, /Error: ended session/);
});

for (const mode of ['reset', 'missing', 'oversized', 'stalled', 'unavailable']) {
  test(`runtime sweep safely stops on ${mode} without exposing transcript data`, async () => {
    const { errors, stderr } = await runRuntimeSweep({ mode });
    assert.equal(errors, '');
    assert.match(stderr, /\[self-improvement\]/);
    assert.doesNotMatch(stderr, /private transcript|do not log me/);
  });
}

for (const mode of ['event-limit', 'byte-limit', 'page-limit']) {
  test(`runtime sweep preserves its scanned prefix at the ${mode}`, async () => {
    const { errors, stderr } = await runRuntimeSweep({ mode });
    assert.match(errors, /Error: within scan budget/);
    assert.doesNotMatch(errors, /beyond scan budget/);
    assert.match(stderr, /scan limit reached/);
  });
}

test('JSONL sweep includes event 2000 but not event 2001', async () => {
  await fs.mkdir(path.join(workspaceDir, '.learnings'));
  const sessionFile = await writeTranscript([
    ...Array.from({ length: 1999 }, () => toolResultLine('all good')),
    toolResultLine('Error: last included event'),
    toolResultLine('Error: first excluded event'),
  ]);
  await handler(makeCommandEvent('new', sessionFile));
  const errors = await fs.readFile(errorsFile(), 'utf8');
  assert.match(errors, /last included event/);
  assert.doesNotMatch(errors, /first excluded event/);
});

test('JSONL byte cap preserves complete lines and ignores a truncated final event', async () => {
  await fs.mkdir(path.join(workspaceDir, '.learnings'));
  const sessionFile = await writeTranscript([
    toolResultLine('Error: complete first event'),
    toolResultLine('Error: incomplete large event ' + 'x'.repeat(8 * 1024 * 1024)),
  ]);
  await handler(makeCommandEvent('new', sessionFile));
  const errors = await fs.readFile(errorsFile(), 'utf8');
  assert.match(errors, /complete first event/);
  assert.doesNotMatch(errors, /incomplete large event/);
});
