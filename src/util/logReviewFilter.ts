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
