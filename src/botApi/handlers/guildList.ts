import { auth } from "../../web/auth-node.js"
import { fetchDiscordUserGuilds } from "../../util/discordUserGuilds.js"
import { getAuthenticatedSession } from "../../web/lib/api-auth.js"
import { getBotClient } from "../../web/lib/botClient.js"
import type { ApiResponse, GuildListResponse } from "../../web/types/web.js"

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

    const accessTokenResult = (await auth.api.getAccessToken({
        body: { providerId: "discord" },
        headers,
    })) as { accessToken?: string } | null
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

    const discordGuilds = await fetchDiscordUserGuilds(accessToken)
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
            ? `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=277025509376&scope=bot%20applications.commands`
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
