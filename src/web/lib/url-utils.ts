/** Returns the normalized URL when the scheme is http(s); otherwise null. */
export function sanitizeHttpUrl(value: unknown): string | null {
    if (typeof value !== "string" || !value) return null
    try {
        const parsed = new URL(value)
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null
        return parsed.toString()
    } catch {
        return null
    }
}
