/** Discord message content limit for `/logreview` replies. */
export const DISCORD_MESSAGE_LIMIT = 2000
export const MAX_INLINE_LOG_BODY = 1800
export const MAX_DISPLAYED_FILTER = 80

/** Last `maxLines` of `lines`, optionally restricted to a case-insensitive substring. */
export function lastMatchingLogLines(
    lines: string[],
    filter: string | null | undefined,
    maxLines: number
): string[] {
    const needle = filter?.trim().toLowerCase() ?? ""
    const matched = needle ? lines.filter((line) => line.toLowerCase().includes(needle)) : lines
    const sliceStart = Math.max(0, matched.length - maxLines)
    return matched.slice(sliceStart)
}

/** Filter text shown in `/logreview` replies; truncated so Discord content stays in range. */
export function displayedLogFilter(
    filter: string | null | undefined,
    maxLen = MAX_DISPLAYED_FILTER
): string | null {
    const trimmed = filter?.trim() ?? ""
    if (!trimmed) return null
    if (trimmed.length <= maxLen) return trimmed
    return `${trimmed.slice(0, Math.max(0, maxLen - 1))}…`
}

export function logReviewNoMatchContent(filter: string | null | undefined): string {
    const shown = displayedLogFilter(filter)
    if (!shown) return "Log file is empty."
    return `No log lines matched filter \`${shown}\`.`
}

export function logReviewHeader(
    lineCount: number,
    filter: string | null | undefined,
    fileName: string
): string {
    const shown = displayedLogFilter(filter)
    const filterNote = shown ? ` matching \`${shown}\`` : ""
    return `Showing last ${lineCount} lines${filterNote} from ${fileName}.`
}

/** Inline code-block reply; truncates `recentText` so the whole message stays under Discord's limit. */
export function logReviewInlineContent(header: string, recentText: string): string {
    const wrapOverhead = "\n\n```\n\n```".length
    const budget = DISCORD_MESSAGE_LIMIT - header.length - wrapOverhead
    const body = budget > 0 ? recentText.slice(0, budget) : ""
    return `${header}\n\n\`\`\`\n${body}\n\`\`\``
}
