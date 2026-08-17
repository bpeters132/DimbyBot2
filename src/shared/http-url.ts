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

/** True when `value` is a usable http(s) URL (same gate as {@link sanitizeHttpUrl}). */
export function isValidHttpUrl(value: string): boolean {
    return sanitizeHttpUrl(value) !== null
}
