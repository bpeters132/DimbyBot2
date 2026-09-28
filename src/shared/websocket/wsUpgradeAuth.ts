/**
 * WebSocket upgrade identity: a valid `?ticket=` Better Auth user id wins when it maps to a
 * Discord snowflake; otherwise fall through to the cookie session. Session failures deny closed.
 */

export type WsUpgradeAuthLookups = {
    parseTicket: (ticket: string, secret: string) => string | null
    resolveDiscordUserId: (betterAuthUserId: string) => Promise<string | null>
    getSessionUserId: () => Promise<string | null>
    onTicketError?: (error: unknown) => void
    onSessionError?: (error: unknown) => void
    onDiscordError?: (error: unknown) => void
}

/**
 * Reads `ticket` from an upgrade URL when a signing secret is configured.
 * Malformed URLs and missing/blank tickets return null so callers can try the session.
 */
export function readWsUpgradeTicket(rawUrl: string, secret: string | undefined): string | null {
    if (!secret) return null
    try {
        const parsed = new URL(rawUrl, "http://127.0.0.1")
        const ticket = parsed.searchParams.get("ticket")
        return ticket || null
    } catch {
        return null
    }
}

/**
 * Resolves the Discord snowflake allowed to open the player WebSocket.
 * A ticket that parses and maps to Discord authenticates immediately; a ticket that is
 * missing, invalid, or has no Discord link falls through to the cookie session.
 * Session lookup/Discord-resolve failures return null (fail closed).
 */
export async function resolveWsUpgradeAuth(
    rawUrl: string,
    secret: string | undefined,
    lookups: WsUpgradeAuthLookups
): Promise<{ userId: string } | null> {
    const ticket = readWsUpgradeTicket(rawUrl, secret)
    if (ticket && secret) {
        try {
            const betterAuthUserId = lookups.parseTicket(ticket, secret)
            if (betterAuthUserId) {
                const discordUserId = await lookups.resolveDiscordUserId(betterAuthUserId)
                if (discordUserId) {
                    return { userId: discordUserId }
                }
            }
        } catch (error: unknown) {
            lookups.onTicketError?.(error)
        }
    }

    let sessionUserId: string | null
    try {
        sessionUserId = await lookups.getSessionUserId()
    } catch (error: unknown) {
        lookups.onSessionError?.(error)
        return null
    }
    if (!sessionUserId) {
        return null
    }
    try {
        const discordUserId = await lookups.resolveDiscordUserId(sessionUserId)
        return discordUserId ? { userId: discordUserId } : null
    } catch (error: unknown) {
        lookups.onDiscordError?.(error)
        return null
    }
}
