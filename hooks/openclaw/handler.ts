/**
 * Self-Improvement Hook for OpenClaw
 *
 * OpenClaw has no per-tool-call hook event, so errors cannot be detected in
 * real time after each command. This hook detects them at session end
 * instead:
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

**Promote when pattern is proven:**
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
const ERRORS_FILE_HEADER = '# Errors\n\nCommand failures and integration errors.\n\n---\n';

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

async function scanTranscriptForErrors(sessionFilePath: string): Promise<SweepExcerpt[]> {
  let raw: string;
  try {
    raw = await fs.readFile(sessionFilePath, 'utf-8');
  } catch {
    return [];
  }

  const excerpts: SweepExcerpt[] = [];
  const seen = new Set<string>();

  for (const jsonLine of raw.split('\n')) {
    if (excerpts.length >= MAX_EXCERPTS) {
      break;
    }
    const trimmed = jsonLine.trim();
    if (!trimmed) {
      continue;
    }

    let entry: unknown;
    try {
      entry = JSON.parse(trimmed);
    } catch {
      continue;
    }
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

function resolveSessionFilePath(
  context: Record<string, unknown>,
  workspaceDir: string | undefined,
): string | undefined {
  const sessionEntry = isObject(context.previousSessionEntry)
    ? context.previousSessionEntry
    : isObject(context.sessionEntry)
      ? context.sessionEntry
      : {};

  const sessionFile = (sessionEntry as Record<string, unknown>).sessionFile;
  if (typeof sessionFile === 'string' && sessionFile.trim()) {
    return sessionFile;
  }

  const sessionIdValue = (sessionEntry as Record<string, unknown>).sessionId;
  const sessionId = typeof sessionIdValue === 'string' ? sessionIdValue.trim() : '';
  if (sessionId && workspaceDir) {
    return path.join(workspaceDir, 'sessions', `${sessionId}.jsonl`);
  }

  return undefined;
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
    `- Detected by the self-improvement hook on \`/${action}\` (OpenClaw has no per-tool-call hook, so errors are swept from the session transcript at session end)`,
    `- Session key: ${sessionKey || 'unknown'}`,
    `- Session transcript: ${sessionFilePath}`,
    '- Excerpts are truncated and redacted; check the transcript for full context',
    '',
    '### Suggested Fix',
    'Triage this entry: if the error was real and non-obvious, keep it and fill in the fix; otherwise mark it resolved or delete it. Before keeping it, grep for its Pattern-Key(s) and fold recurrences into the existing entry (bump Recurrence-Count) instead of duplicating.',
    '',
    '### Metadata',
    `- Source: ${SWEEP_SOURCE}`,
    '- Reproducible: unknown',
    ...patternKeys.map((patternKey) => `- Pattern-Key: ${patternKey}`),
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

  const sessionFilePath = resolveSessionFilePath(context, workspaceDir);
  if (!sessionFilePath) {
    return;
  }

  const excerpts = await scanTranscriptForErrors(sessionFilePath);
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
    sessionKey: typeof event.sessionKey === 'string' ? event.sessionKey : '',
    sessionFilePath,
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
      'Confirm, resolve, or delete them when convenient.';
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
  } catch (err) {
    // Never break the gateway on hook failure.
    if (process.env.SELF_IMPROVEMENT_HOOK_DEBUG) {
      console.error('[self-improvement] hook failed:', err);
    }
  }
};

export default handler;
