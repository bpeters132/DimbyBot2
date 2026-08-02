/**
 * Escapes Discord markdown metacharacters in plain-text display names.
 * Used so RRQ / event messages cannot be spoofed via `*bold*` / `_italic_` / code ticks.
 */
export function escapeDiscordMarkdown(text: string): string {
    return text
        .replace(/\\/g, "\\\\")
        .replace(/\*/g, "\\*")
        .replace(/_/g, "\\_")
        .replace(/`/g, "\\`")
}
