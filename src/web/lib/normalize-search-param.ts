/** First value when App Router searchParams supply string | string[] for repeated keys. */
export function normalizeSearchParam(value: string | string[] | undefined): string | undefined {
    if (value === undefined) return undefined
    if (Array.isArray(value)) {
        for (const entry of value) {
            if (typeof entry !== "string") continue
            const trimmed = entry.trim()
            if (trimmed.length > 0) return trimmed
        }
        const first = value[0]
        return typeof first === "string" ? first : undefined
    }
    return value
}
