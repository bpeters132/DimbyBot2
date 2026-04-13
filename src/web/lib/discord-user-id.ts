import { auth } from "../auth-node.js"
import { fetchDiscordCurrentUserId } from "./discord-rest.js"
import { getWebPrismaClient } from "./prisma.js"

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
        console.warn(
            "[discord-user-id] account lookup skipped (database unavailable?)",
            code || (e instanceof Error ? e.message : e)
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
        const accessResult = (await auth.api.getAccessToken({
            body: { providerId: "discord" },
            headers: sessionHeaders,
        })) as {
            accessToken: string
            scopes?: string[]
            accessTokenExpiresAt?: Date
            idToken?: string
        }
        const accessToken = accessResult?.accessToken
        if (!accessToken) {
            console.warn(
                "[discord-user-id] No OAuth access token from Better Auth (getAccessToken returned empty token)"
            )
            return null
        }
        return await fetchDiscordCurrentUserId(accessToken)
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        console.warn("[discord-user-id] Discord token / @me fallback failed:", message)
        return null
    }
}
