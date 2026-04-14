/**
 * Parses `BOT_API_PORT` for the bot HTTP + WebSocket listener (`src/server.ts`).
 * Returns `3001` when unset or invalid (non-integer or outside 1–65535).
 */
export function resolvedBotApiPort(): number {
    const raw = process.env.BOT_API_PORT?.trim()
    if (!raw) return 3001
    const n = Number(raw)
    return Number.isInteger(n) && n >= 1 && n <= 65535 ? n : 3001
}
