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
const { test, beforeEach, afterEach } = require('node:test');

const handler = require('./handler.js');

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
  assert.doesNotMatch(injected.content, /Pending triage/);
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
  const sessionFile = await writeTranscript([
    toolResultLine(
      `Error: request failed with api_key=sk-live-1234567890 Bearer abc.def.ghi token: hunter2 ${longTail}`,
    ),
  ]);

  await handler(makeCommandEvent('new', sessionFile));

  const content = await fs.readFile(errorsFile(), 'utf-8');
  assert.doesNotMatch(content, /sk-live-1234567890/);
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
