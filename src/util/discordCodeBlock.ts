/** Discord embed field value limit. */
export const DISCORD_EMBED_FIELD_MAX_LENGTH = 1024

/**
 * Breaks triple-backtick runs so eval/output cannot close a surrounding fenced code block early
 * (zero-width space after the first backtick).
 */
export function escapeFenceBreaks(s: string): string {
    return s.replace(/```/g, "`\u200b``")
}

/**
 * Builds a fenced code block for embed fields: escapes triple-backtick runs and truncates to
 * Discord's field length budget.
 */
export function toCodeBlock(
    language: string,
    value: string,
    maxLength = DISCORD_EMBED_FIELD_MAX_LENGTH
): string {
    const escaped = escapeFenceBreaks(value)
    const open = `\`\`\`${language}\n`
    const close = "\n```"
    const budget = maxLength - open.length - close.length
    const body =
        escaped.length > budget
            ? `${escaped.slice(0, Math.max(0, budget - 20))}\n...[truncated]`
            : escaped
    return `${open}${body}${close}`
}
