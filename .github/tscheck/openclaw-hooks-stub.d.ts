/**
 * Minimal type stub for the `openclaw/hooks` module, used only by CI to
 * type-check hooks/openclaw/handler.ts outside a real OpenClaw install.
 * Kept out of hooks/openclaw/ so it is never copied into a live hooks
 * directory. Mirrors OpenClaw's InternalHookEvent shape.
 */
declare module 'openclaw/hooks' {
  export type HookHandler = (event: {
    type: string;
    action: string;
    sessionKey: string;
    context: Record<string, unknown>;
    timestamp: Date;
    messages: string[];
  }) => void | Promise<void>;
}
