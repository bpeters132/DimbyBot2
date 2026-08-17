/** Discord snowflake digit strings accepted for optional DB channel/message fields. */
const DISCORD_SNOWFLAKE_ID_RE = /^\d{1,20}$/
const MAX_SNOWFLAKE = (1n << 64n) - 1n

/**
 * Trims and validates a Discord snowflake for repository writes: positive uint64 digit string
 * (1–20 digits). Returns null for non-strings and invalid values.
 */
export function normalizeOptionalDiscordSnowflake(value: unknown): string | null {
    if (typeof value !== "string") return null
    const t = value.trim()
    if (!DISCORD_SNOWFLAKE_ID_RE.test(t)) return null
    try {
        const n = BigInt(t)
        if (n < 1n || n > MAX_SNOWFLAKE) return null
    } catch {
        return null
    }
    return t
}
