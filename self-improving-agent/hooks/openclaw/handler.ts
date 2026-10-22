/**
 * Self-Improvement Hook for OpenClaw
 *
 * This integration uses internal HOOK.md events, not typed plugin hooks.
 * Internal events have no per-tool-call callback; this hook detects errors
 * at session end instead:
 *
 * - agent:bootstrap        Injects the self-improvement reminder before
 *                          workspace files are injected, including a note
 *                          when auto-detected errors are awaiting triage.
 * - command:new / :reset   Session-end sweep: scans the transcript of the
 *                          session that just ended for error patterns and
 *                          appends a pending entry to
 *                          <workspace>/.learnings/ERRORS.md.
 *
 * The sweep is opt-in: it only runs when <workspace>/.learnings/ exists.
 * Excerpts are truncated and redacted before being written.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import type { HookHandler } from 'openclaw/hooks';

const REMINDER_NAME = 'SELF_IMPROVEMENT_REMINDER.md';
const REMINDER_PATH = REMINDER_NAME;
const REMINDER_HEADER = '## Self-Improvement Reminder';

const REMINDER_CONTENT = `${REMINDER_HEADER}

After completing tasks, evaluate whether any learnings should be captured.

Only log if this repo or workspace is using the self-improvement skill.

Before logging:
- Create only missing \`.learnings/\` files; never overwrite existing content
- Do not log secrets, tokens, private keys, environment variables, or raw transcripts
- Prefer short summaries or redacted excerpts over full command output

**Log when:**
- User corrects you → \`.learnings/LEARNINGS.md\`
- Command/operation fails → \`.learnings/ERRORS.md\`
- User wants missing capability → \`.learnings/FEATURE_REQUESTS.md\`
- You discover your knowledge was wrong → \`.learnings/LEARNINGS.md\`
- You find a better approach → \`.learnings/LEARNINGS.md\`

**Maintain before reuse or promotion:**
- Review relevant/due claims, including one-off and unpromoted learnings; use the skill's Maintenance workflow
- Type determines how to check; rate determines when; changed dependencies trigger checks, not retirement
- Record actual dated evidence; unavailable/conflicting evidence stays unresolved
- Preserve history and source links; never retire by age or count a review as recurrence

**Promote supported, scoped guidance:**
- Behavioral patterns → \`SOUL.md\`
- Workflow improvements → \`AGENTS.md\`
- Tool gotchas → \`TOOLS.md\`

Keep entries simple: date, title, what happened, and what to do differently.`;

// Error-detection patterns. Ordered specific → generic: the first matching pattern
// supplies the Pattern-Key stamped on swept entries, which is what makes
// auto-detected errors dedup-able and recurrence-countable (see the
// "Pattern-Key Taxonomy" section in SKILL.md).
const ERROR_PATTERN_KEYS: Array<[string, string]> = [
  ['command not found', 'shell.command-not-found'],
  ['No such file', 'fs.no-such-file'],
  ['Permission denied', 'fs.permission-denied'],
  ['ModuleNotFoundError', 'deps.module-not-found'],
  ['npm ERR!', 'deps.npm-error'],
  ['Traceback', 'runtime.python-exception'],
  ['SyntaxError', 'runtime.syntax-error'],
  ['TypeError', 'runtime.type-error'],
  ['Exception', 'runtime.exception'],
  ['fatal:', 'vcs.fatal-error'],
  ['exit code', 'shell.nonzero-exit'],
  ['non-zero', 'shell.nonzero-exit'],
  ['error:', 'runtime.error'],
  ['Error:', 'runtime.error'],
  ['ERROR:', 'runtime.error'],
  ['failed', 'runtime.failure'],
  ['FAILED', 'runtime.failure'],
];

interface SweepExcerpt {
  excerpt: string;
  patternKey: string;
}

const SWEEP_SOURCE = 'openclaw-error-sweep';
const MAX_EXCERPTS = 5;
const MAX_EXCERPT_LENGTH = 200;
const MAX_TRANSCRIPT_BYTES = 8 * 1024 * 1024;
const MAX_TRANSCRIPT_EVENTS = 2000;
const ERRORS_FILE_HEADER = '# Errors\n\nCommand failures and integration errors.\n\n---\n';

interface TranscriptIdentity {
  agentId: string;
  sessionId: string;
  sessionKey: string;
  storePath?: string;
}

type TranscriptSource = { label: string } & (
  | { file: string; identity?: never }
  | { identity: TranscriptIdentity; file?: never }
);

// Private host API, tested with OpenClaw 2026.10.4. Keep its contract here;
// the host owns storage schemas, compression, and session isolation.
type TranscriptReader = (params: TranscriptIdentity & {
  cursor?: string; maxEvents: number; maxBytes: number;
}) => Promise<
  | { kind: 'missing' | 'reset' }
  | { kind: 'page'; events: Array<{ event: unknown }>; cursor: string;
      hasMore: boolean; serializedBytes: number; requiredBytes?: number }
>;

let runtimeReader: Promise<TranscriptReader> | undefined;

function debug(message: string): void {
  if (process.env.SELF_IMPROVEMENT_HOOK_DEBUG) {
    console.error(`[self-improvement] ${message}`);
  }
}

function loadTranscriptReader(): Promise<TranscriptReader> {
  return runtimeReader ??= (async () => {
    // A copied hook cannot resolve a global OpenClaw install via bare import.
    // Resolve from the running host, never another installation beside the hook.
    const entry = await fs.realpath(process.argv[1]);
    const hostRequire = createRequire(pathToFileURL(entry));
    const modulePath = hostRequire.resolve('openclaw/plugin-sdk/session-transcript-runtime');
    const runtime = await import(pathToFileURL(modulePath).href);
    if (typeof runtime.readSessionTranscriptRawDelta !== 'function') {
      throw new Error('Transcript reader unavailable');
    }
    return runtime.readSessionTranscriptRawDelta as TranscriptReader;
  })();
}

async function* readTranscriptEntries(source: TranscriptSource): AsyncGenerator<unknown> {
  if (source.file !== undefined) {
    const file = await fs.open(source.file, 'r');
    try {
      const buffer = Buffer.alloc(MAX_TRANSCRIPT_BYTES + 1);
      let length = 0;
      while (length < buffer.length) {
        const { bytesRead } = await file.read(buffer, length, buffer.length - length, null);
        if (!bytesRead) break;
        length += bytesRead;
      }
      const capped = length > MAX_TRANSCRIPT_BYTES;
      let raw = buffer.subarray(0, Math.min(length, MAX_TRANSCRIPT_BYTES)).toString('utf8');
      if (capped) {
        raw = raw.slice(0, raw.lastIndexOf('\n') + 1);
        debug('JSONL byte limit reached; later events were not scanned');
      }
      let count = 0;
      for (const line of raw.split('\n')) {
        if (!line.trim()) continue;
        if (count++ >= MAX_TRANSCRIPT_EVENTS) {
          debug('Transcript event limit reached; later events were not scanned');
          return;
        }
        let event: unknown;
        try { event = JSON.parse(line); } catch { continue; }
        yield event;
      }
    } finally {
      await file.close();
    }
    return;
  }

  const read = await loadTranscriptReader();
  let cursor: string | undefined;
  let bytesLeft = MAX_TRANSCRIPT_BYTES;
  let eventsLeft = MAX_TRANSCRIPT_EVENTS;
  let pageBytes = 1024 * 1024;
  for (let pageNumber = 0; pageNumber < 16 && bytesLeft > 0 && eventsLeft > 0; pageNumber++) {
    const maxBytes = Math.min(pageBytes, bytesLeft);
    const page = await read({ ...source.identity, cursor, maxEvents: Math.min(256, eventsLeft), maxBytes });
    if (page.kind !== 'page') {
      // Discard any excerpts collected before a generation change.
      throw new Error('Transcript missing or reset');
    }
    if (page.events.length === 0 && page.hasMore) {
      if (page.requiredBytes && page.requiredBytes > maxBytes && page.requiredBytes <= bytesLeft) {
        pageBytes = page.requiredBytes;
        continue;
      }
      debug('Transcript page cannot advance within the byte budget');
      return;
    }
    bytesLeft -= page.serializedBytes;
    eventsLeft -= page.events.length;
    for (const { event } of page.events) yield event;
    if (!page.hasMore) return;
    if (page.cursor === cursor) {
      debug('Transcript cursor did not advance');
      return;
    }
    cursor = page.cursor;
    pageBytes = 1024 * 1024;
  }
  debug('Transcript scan limit reached; later events were not scanned');
}

// Best-effort redaction of common secret shapes before anything is written.
const REDACTION_RULES: Array<[RegExp, string]> = [
  [/\b(api[_-]?key|token|secret|password|passwd|authorization|credential)s?\b(\s*[=:]\s*)\S+/gi, '$1$2[REDACTED]'],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]'],
  [/\bgh[pousr]_[A-Za-z0-9]{16,}\b/g, '[REDACTED]'],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, '[REDACTED]'],
  [/\bAKIA[0-9A-Z]{16}\b/g, '[REDACTED]'],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}\b/g, '[REDACTED-JWT]'],
  [/\b[A-Za-z0-9_-]{40,}\b/g, '[REDACTED-BLOB]'],
];

type HookEvent = Parameters<HookHandler>[0];

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

function isInjectedReminderFile(value: unknown): boolean {
  if (!isObject(value) || value.path !== REMINDER_PATH) {
    return false;
  }

  return (
    value.virtual === true ||
    (typeof value.content === 'string' && value.content.includes(REMINDER_HEADER))
  );
}

function redactSensitiveText(text: string): string {
  let result = text;
  for (const [pattern, replacement] of REDACTION_RULES) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

function sanitizeExcerptLine(line: string): string {
  let excerpt = redactSensitiveText(line.trim()).split('```').join("'''");
  if (excerpt.length > MAX_EXCERPT_LENGTH) {
    excerpt = `${excerpt.slice(0, MAX_EXCERPT_LENGTH)}…`;
  }
  return excerpt;
}

function collectTextFragments(value: unknown, out: string[], depth = 0): void {
  if (depth > 4 || out.length > 200) {
    return;
  }
  if (typeof value === 'string') {
    out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectTextFragments(item, out, depth + 1);
    }
    return;
  }
  if (isObject(value)) {
    if (typeof value.text === 'string') {
      out.push(value.text);
    }
    if ('content' in value) {
      collectTextFragments(value.content, out, depth + 1);
    }
  }
}

function matchErrorPatternKey(line: string): string | null {
  for (const [pattern, patternKey] of ERROR_PATTERN_KEYS) {
    if (line.includes(pattern)) {
      return patternKey;
    }
  }
  return null;
}

async function scanTranscriptForErrors(source: TranscriptSource): Promise<SweepExcerpt[]> {
  const excerpts: SweepExcerpt[] = [];
  const seen = new Set<string>();

  for await (const entry of readTranscriptEntries(source)) {
    if (!isObject(entry) || !isObject(entry.message)) {
      continue;
    }

    const fragments: string[] = [];
    collectTextFragments(entry.message.content, fragments);

    for (const fragment of fragments) {
      for (const line of fragment.split('\n')) {
        const patternKey = matchErrorPatternKey(line);
        if (!patternKey) {
          continue;
        }
        const excerpt = sanitizeExcerptLine(line);
        if (!excerpt || seen.has(excerpt)) {
          continue;
        }
        seen.add(excerpt);
        excerpts.push({ excerpt, patternKey });
        if (excerpts.length >= MAX_EXCERPTS) {
          return excerpts;
        }
      }
    }
  }

  return excerpts;
}

async function resolveTranscriptSource(
  context: Record<string, unknown>,
  workspaceDir: string,
  sessionKey: string,
): Promise<TranscriptSource | undefined> {
  const sessionEntry = isObject(context.previousSessionEntry)
    ? context.previousSessionEntry
    : isObject(context.sessionEntry)
      ? context.sessionEntry
      : {};

  const sessionFile = sessionEntry.sessionFile;
  const sessionId = typeof sessionEntry.sessionId === 'string' ? sessionEntry.sessionId.trim() : '';
  if (typeof sessionFile === 'string' && sessionFile.trim()) {
    if (!sessionFile.startsWith('sqlite:')) return { file: sessionFile, label: sessionFile };
    const marker = /^sqlite:([^:]+):([^:]+):(.+)$/.exec(sessionFile);
    if (!marker || !path.isAbsolute(marker[3]) || (sessionId && sessionId !== marker[2]) || !sessionKey) {
      return undefined;
    }
    return { label: sessionFile, identity: {
      agentId: marker[1], sessionId: marker[2], storePath: marker[3], sessionKey,
    } };
  }

  if (!sessionId) return undefined;
  const file = path.join(workspaceDir, 'sessions', `${sessionId}.jsonl`);
  try {
    await fs.access(file);
    return { file, label: file };
  } catch (error) {
    if (!isObject(error) || error.code !== 'ENOENT') throw error;
  }
  if (typeof context.agentId === 'string' && context.agentId.trim() && sessionKey) {
    return { label: `session:${sessionId}`, identity: {
      agentId: context.agentId, sessionId, sessionKey,
      ...(typeof context.storePath === 'string' && context.storePath.trim() ? { storePath: context.storePath } : {}),
    } };
  }
  return { file, label: file };
}

function generateEntryId(timestamp: Date): string {
  const yyyymmdd = timestamp.toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = Math.random().toString(36).slice(2, 5).toUpperCase().padEnd(3, '0');
  return `ERR-${yyyymmdd}-${suffix}`;
}

function formatErrorEntry(params: {
  excerpts: SweepExcerpt[];
  sessionKey: string;
  sessionFilePath: string;
  action: string;
  timestamp: Date;
}): string {
  const { excerpts, sessionKey, sessionFilePath, action, timestamp } = params;
  const plural = excerpts.length === 1 ? '' : 's';
  const patternKeys = [...new Set(excerpts.map((item) => item.patternKey))];

  return [
    `## [${generateEntryId(timestamp)}] openclaw_session_sweep`,
    '',
    `**Logged**: ${timestamp.toISOString()}`,
    '**Priority**: medium',
    '**Status**: pending',
    '**Area**: config',
    '',
    '### Summary',
    `Session-end sweep detected ${excerpts.length} possible error${plural} in the previous OpenClaw session.`,
    '',
    '### Error',
    '```',
    ...excerpts.map((item) => item.excerpt),
    '```',
    '',
    '### Context',
    `- Detected by the self-improvement internal hook on \`/${action}\`; this integration sweeps transcripts at session end (typed plugins can observe individual tool calls)`,
    `- Session key: ${sessionKey || 'unknown'}`,
    `- Session transcript: ${sessionFilePath}`,
    '- Excerpts are truncated and redacted; check the transcript for full context',
    '',
    '### Suggested Fix',
    'Triage each possible error and reusable claim separately; preserve this sweep and link any follow-up entries. Mark false positives with a reason, not deletion. Pattern-Keys are search hints, not decay classifications. Count only confirmed new occurrences of the same scoped claim, never reviews. Initialize cause/rate and validate through the skill Maintenance workflow before reuse or promotion.',
    '',
    '### Metadata',
    `- Source: ${SWEEP_SOURCE}`,
    '- Reproducible: unknown',
    ...patternKeys.map((patternKey) => `- Pattern-Key: ${patternKey}`),
    '',
    '### Maintenance',
    '- Claim: unknown — possible unrelated errors; needs triage',
    '- Scope: unknown',
    '- Authority: unknown',
    '- Decay: unknown / unknown',
    '- Revalidate: during triage before reuse; identify claims and choose cause-specific checks',
    '- Validation: pending',
    '- Evidence: none yet — excerpts are detection candidates, not validation',
    '- Disposition: retain — provisional, not validated',
    '- Guidance: none',
    '',
    '---',
  ].join('\n');
}

async function handleSessionEndSweep(event: HookEvent): Promise<void> {
  const context = event.context as Record<string, unknown>;
  const workspaceDir =
    typeof context.workspaceDir === 'string' && context.workspaceDir.trim()
      ? context.workspaceDir
      : undefined;
  if (!workspaceDir) {
    return;
  }

  // Opt-in gate: only sweep when the workspace uses the self-improvement skill.
  const learningsDir = path.join(workspaceDir, '.learnings');
  try {
    const stats = await fs.stat(learningsDir);
    if (!stats.isDirectory()) {
      return;
    }
  } catch {
    return;
  }

  const sessionKey = typeof event.sessionKey === 'string' ? event.sessionKey : '';
  const source = await resolveTranscriptSource(context, workspaceDir, sessionKey);
  if (!source) {
    debug('Cannot resolve ended-session transcript identity');
    return;
  }

  let excerpts: SweepExcerpt[];
  try {
    excerpts = await scanTranscriptForErrors(source);
  } catch {
    debug('Transcript read unavailable or reset; check the hook installation, session identity, and OpenClaw version');
    return;
  }
  if (excerpts.length === 0) {
    return;
  }

  const errorsFilePath = path.join(learningsDir, 'ERRORS.md');
  let existing = '';
  try {
    existing = await fs.readFile(errorsFilePath, 'utf-8');
  } catch {
    // Missing file is fine; it is created below.
  }

  const freshExcerpts = excerpts.filter((item) => !existing.includes(item.excerpt));
  if (freshExcerpts.length === 0) {
    return;
  }

  const entry = formatErrorEntry({
    excerpts: freshExcerpts,
    sessionKey,
    sessionFilePath: source.label,
    action: event.action,
    timestamp: event.timestamp instanceof Date ? event.timestamp : new Date(),
  });

  if (!existing) {
    try {
      await fs.writeFile(errorsFilePath, `${ERRORS_FILE_HEADER}\n${entry}\n`, { flag: 'wx' });
      return;
    } catch (err) {
      if (!isObject(err) || (err as { code?: string }).code !== 'EEXIST') {
        throw err;
      }
    }
  }
  await fs.appendFile(errorsFilePath, `\n${entry}\n`);
}

async function countPendingSweepEntries(workspaceDir: string | undefined): Promise<number> {
  if (!workspaceDir) {
    return 0;
  }
  let content: string;
  try {
    content = await fs.readFile(path.join(workspaceDir, '.learnings', 'ERRORS.md'), 'utf-8');
  } catch {
    return 0;
  }

  return content
    .split(/^## /m)
    .slice(1)
    .filter(
      (section) =>
        section.includes(`Source: ${SWEEP_SOURCE}`) && section.includes('**Status**: pending'),
    ).length;
}

async function handleBootstrap(event: HookEvent): Promise<void> {
  // Skip sub-agent sessions to avoid bootstrap issues
  // Sub-agents have sessionKey patterns like "agent:main:subagent:..."
  const sessionKey = event.sessionKey || '';
  if (sessionKey.includes(':subagent:')) {
    return;
  }

  const context = event.context as Record<string, unknown>;

  // Inject the reminder as a virtual bootstrap file
  // Check that bootstrapFiles is an array before pushing
  if (!Array.isArray(context.bootstrapFiles)) {
    return;
  }

  const occupiedByOtherFile = context.bootstrapFiles.some(
    (file) => isObject(file) && file.path === REMINDER_PATH && !isInjectedReminderFile(file),
  );
  if (occupiedByOtherFile) {
    return;
  }

  let reminderContent = REMINDER_CONTENT;
  const workspaceDir =
    typeof context.workspaceDir === 'string' && context.workspaceDir.trim()
      ? context.workspaceDir
      : undefined;
  const pendingSweepCount = await countPendingSweepEntries(workspaceDir);
  if (pendingSweepCount > 0) {
    const plural = pendingSweepCount === 1 ? 'y' : 'ies';
    reminderContent +=
      `\n\n**Pending triage:** ${pendingSweepCount} auto-detected error entr${plural} ` +
      `(Source: ${SWEEP_SOURCE}) in \`.learnings/ERRORS.md\` await review. ` +
      'Triage individual claims; preserve the sweep and mark false positives with a reason.';
  }

  const cleanedBootstrapFiles = context.bootstrapFiles.filter(
    (file, index, files) =>
      !isInjectedReminderFile(file) ||
      files.findIndex((candidate) => isInjectedReminderFile(candidate)) === index,
  );

  const reminderFile = {
    name: REMINDER_NAME,
    path: REMINDER_PATH,
    content: reminderContent,
    missing: false,
    virtual: true,
  };

  const existingIndex = cleanedBootstrapFiles.findIndex((file) => isInjectedReminderFile(file));
  if (existingIndex === -1) {
    cleanedBootstrapFiles.push(reminderFile);
  } else {
    cleanedBootstrapFiles[existingIndex] = reminderFile;
  }

  context.bootstrapFiles = cleanedBootstrapFiles;
}

const handler: HookHandler = async (event) => {
  // Safety checks for event structure
  if (!event || typeof event !== 'object') {
    return;
  }
  if (!event.context || typeof event.context !== 'object') {
    return;
  }

  try {
    if (event.type === 'agent' && event.action === 'bootstrap') {
      await handleBootstrap(event);
      return;
    }
    if (event.type === 'command' && (event.action === 'new' || event.action === 'reset')) {
      await handleSessionEndSweep(event);
    }
  } catch {
    // Never break the gateway on hook failure.
    debug('Hook failed; check workspace permissions and hook compatibility');
  }
};

export default handler;
