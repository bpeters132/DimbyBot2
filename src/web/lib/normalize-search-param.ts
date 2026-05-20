/** First value when App Router searchParams supply string | string[] for repeated keys. */
export function normalizeSearchParam(value: string | string[] | undefined): string | undefined {
    if (value === undefined) return undefined
    if (Array.isArray(value)) return value[0]
    return value
}
