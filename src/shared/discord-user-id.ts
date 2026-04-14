import { auth } from "./auth-node.js"
import { fetchDiscordCurrentUserId } from "./discord-rest.js"
import { getWebPrismaClient } from "../lib/webPrisma.js"

/** Discord snowflakes are numeric strings (typically 17–19 digits; allow up to 22 for future-proofing). */
export function isDiscordSnowflake(id: string): boolean {
    return /^\d{17,22}$/.test(id.trim())
}

/**
 * Better Auth uses an internal `user.id`; Discord (voice states, `GuildMember`, `ownerId`) expects
 * the OAuth account snowflake stored on `account.accountId` for the linked Discord provider.
 */
export async function getDiscordAccountSnowflake(betterAuthUserId: string): Promise<string | null> {
    let accounts: { providerId: string; accountId: string }[]
    try {
        accounts = await getWebPrismaClient().account.findMany({
            where: { userId: betterAuthUserId },
            select: { providerId: true, accountId: true },
        })
    } catch (e) {
        const code =
            e && typeof e === "object" && "code" in e ? String((e as { code: unknown }).code) : ""
        const errName = e instanceof Error ? e.name : "unknown"
        console.warn(
            "[discord-user-id] account lookup skipped (database unavailable?)",
            code || errName || "account lookup failed"
        )
        return null
    }
    const discordRow = accounts.find(
        (a) => a.providerId && a.providerId.toLowerCase() === "discord"
    )
    if (discordRow?.accountId && isDiscordSnowflake(discordRow.accountId)) {
        return discordRow.accountId.trim()
    }
    return null
}

/**
 * Resolves the signed-in user's Discord snowflake for guild/voice/permission logic.
 * Uses DB `account.accountId`, then Better Auth `user.id` if it is already a snowflake, then Discord
 * `GET /users/@me` with the session access token when the DB row is missing or mis-keyed.
 */
export async function resolveDiscordUserSnowflake(
    betterAuthUserId: string,
    sessionHeaders: Headers
): Promise<string | null> {
    const fromDb = await getDiscordAccountSnowflake(betterAuthUserId)
    if (fromDb) {
        return fromDb
    }
    if (isDiscordSnowflake(betterAuthUserId)) {
        return betterAuthUserId.trim()
    }

    try {
        const accessResult: unknown = await auth.api.getAccessToken({
            body: { providerId: "discord" },
            headers: sessionHeaders,
        })
        if (!accessResult || typeof accessResult !== "object") {
            console.warn(
                "[discord-user-id] getAccessToken returned a non-object; cannot use Discord @me fallback"
            )
            return null
        }
        const tokenRecord = accessResult as Record<string, unknown>
        const accessTokenRaw = tokenRecord.accessToken
        if (typeof accessTokenRaw !== "string" || accessTokenRaw.trim().length === 0) {
            console.warn(
                "[discord-user-id] getAccessToken returned no usable accessToken (missing or empty string)"
            )
            return null
        }
        const accessToken = accessTokenRaw.trim()
        if (
            "scopes" in tokenRecord &&
            tokenRecord.scopes !== undefined &&
            !Array.isArray(tokenRecord.scopes)
        ) {
            console.warn(
                "[discord-user-id] getAccessToken scopes field is present but not an array; ignoring"
            )
        }
        if (
            "accessTokenExpiresAt" in tokenRecord &&
            tokenRecord.accessTokenExpiresAt !== undefined &&
            tokenRecord.accessTokenExpiresAt !== null
        ) {
            const exp = tokenRecord.accessTokenExpiresAt
            const expOk = exp instanceof Date || typeof exp === "string" || typeof exp === "number"
            if (!expOk) {
                console.warn(
                    "[discord-user-id] getAccessToken accessTokenExpiresAt is not a date, string, or number; continuing with token only"
                )
            }
        }
        return await fetchDiscordCurrentUserId(accessToken)
    } catch (error: unknown) {
        const errName = error instanceof Error ? error.name : "unknown"
        console.warn("[discord-user-id] Discord token / @me fallback failed:", errName)
        return null
    }
}
