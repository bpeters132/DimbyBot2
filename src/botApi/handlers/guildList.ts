import { auth } from "../../web/auth-node.js"
import { fetchDiscordUserGuilds } from "../../util/discordUserGuilds.js"
import { getAuthenticatedSession } from "../../web/lib/api-auth.js"
import { getBotClient, tryGetBotClient } from "../../web/lib/botClient.js"
import type { ApiResponse } from "../../types/apiPayloads.js"
import type { GuildListResponse } from "../../types/web.js"

/**
 * Discord invite permissions bitset:
 * Administrator, ManageGuild, ManageMessages, Connect, Speak, and related playback controls.
 */
export const BOT_INVITE_PERMISSIONS = "277025509376"

function discordGuildIconUrl(guildId: string, icon: string | null): string | null {
    if (!icon) return null
    return `https://cdn.discordapp.com/icons/${guildId}/${icon}.png?size=128`
}

export async function guildListGET(
    headers: Headers
): Promise<{ status: number; body: ApiResponse<GuildListResponse> }> {
    const sessionResult = await getAuthenticatedSession(headers)
    if (sessionResult.ok === false) {
        return {
            status: sessionResult.status,
            body: {
                ok: false,
                error: { error: sessionResult.error, details: sessionResult.details },
            },
        }
    }

    let accessTokenResult: { accessToken?: string } | null
    try {
        accessTokenResult = (await auth.api.getAccessToken({
            body: { providerId: "discord" },
            headers,
        })) as { accessToken?: string } | null
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        const client = tryGetBotClient()
        if (client) {
            client.error("[guildListGET] getAccessToken threw", { message, err })
        } else {
            console.error("[guildListGET] getAccessToken threw", { message, err })
        }
        return {
            status: 500,
            body: {
                ok: false,
                error: { error: "Failed to retrieve Discord access token.", details: message },
            },
        }
    }
    const accessToken = accessTokenResult?.accessToken
    if (!accessToken) {
        return {
            status: 403,
            body: {
                ok: false,
                error: { error: "Forbidden", details: "Missing Discord access token." },
            },
        }
    }

    let discordGuilds: Awaited<ReturnType<typeof fetchDiscordUserGuilds>>
    try {
        discordGuilds = await fetchDiscordUserGuilds(accessToken)
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        console.error("[guildListGET] fetchDiscordUserGuilds threw", { message })
        return {
            status: 502,
            body: {
                ok: false,
                error: { error: "Discord API request failed.", details: message },
            },
        }
    }
    if (discordGuilds.ok === false) {
        return {
            status: 502,
            body: {
                ok: false,
                error: { error: "Discord API request failed.", details: discordGuilds.message },
            },
        }
    }

    const userGuilds = discordGuilds.guilds
    const botGuilds = getBotClient().guilds.cache
    const mutualGuilds = userGuilds
        .filter((guild) => botGuilds.has(guild.id))
        .map((guild) => ({
            id: guild.id,
            name: guild.name,
            iconUrl: discordGuildIconUrl(guild.id, guild.icon),
            memberCount: botGuilds.get(guild.id)?.memberCount ?? null,
        }))

    const clientId = process.env.CLIENT_ID || ""
    const botInviteUrl =
        mutualGuilds.length === 0 && clientId
            ? `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=${BOT_INVITE_PERMISSIONS}&scope=bot%20applications.commands`
            : undefined

    return {
        status: 200,
        body: {
            ok: true,
            data: {
                guilds: mutualGuilds,
                botInviteUrl,
            },
        },
    }
}
