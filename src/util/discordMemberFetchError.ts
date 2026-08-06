/**
 * True when a Discord.js guild-member fetch failed because the member is unknown / not in the guild.
 * Used by web search/enqueue to fail closed instead of treating every fetch error as a hard outage.
 */
export function isMemberFetchNotFound(error: unknown): boolean {
    if (!error || typeof error !== "object") return false
    const maybe = error as {
        status?: unknown
        code?: unknown
        name?: unknown
    }
    return (
        maybe.status === 404 ||
        maybe.code === 404 ||
        maybe.code === 10007 ||
        maybe.name === "UnknownMember"
    )
}
