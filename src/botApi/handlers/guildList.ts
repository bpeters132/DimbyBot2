import { auth } from "../../shared/auth-node.js"
import { fetchDiscordUserGuilds } from "../../util/discordUserGuilds.js"
import { discordGuildIconUrl } from "../../util/discordGuildIconUrl.js"
import { DISCORD_BOT_INVITE_PERMISSIONS } from "../../shared/discordBotPermissions.js"
import { getAuthenticatedSession } from "../../shared/api-auth.js"
import { resolveDiscordUserSnowflake } from "../../shared/discord-user-id.js"
import { snapshotGuildListPlayer } from "../../shared/player-state.js"
import { tryGetBotClient } from "../../lib/botClientRegistry.js"
import { mapDiscordGuildListFailureStatus } from "../guildListDiscordStatus.js"
import { mapGuildListSetupFailure } from "../guildListSetupFailure.js"
import type { ApiResponse } from "../../types/index.js"
import type { GuildListResponse } from "../../types/web.js"

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
            client.error("[guildListGET] getAccessToken threw", { message })
        } else {
            console.error("[guildListGET] getAccessToken threw", { message })
        }
        const mapped = mapGuildListSetupFailure("access_token_threw")
        return {
            status: mapped.status,
            body: {
                ok: false,
                error: {
                    error: mapped.error,
                    details: mapped.details,
                },
            },
        }
    }
    const accessToken = accessTokenResult?.accessToken
    if (!accessToken) {
        const mapped = mapGuildListSetupFailure("access_token_missing")
        return {
            status: mapped.status,
            body: {
                ok: false,
                error: { error: mapped.error, details: mapped.details },
            },
        }
    }

    let discordGuilds: Awaited<ReturnType<typeof fetchDiscordUserGuilds>>
    try {
        discordGuilds = await fetchDiscordUserGuilds(accessToken)
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        const client = tryGetBotClient()
        if (client) {
            client.error("[guildListGET] fetchDiscordUserGuilds threw", { message })
        } else {
            console.error("[guildListGET] fetchDiscordUserGuilds threw", { message })
        }
        const mapped = mapGuildListSetupFailure("discord_guilds_threw")
        return {
            status: mapped.status,
            body: {
                ok: false,
                error: {
                    error: mapped.error,
                    details: mapped.details,
                },
            },
        }
    }
    if (discordGuilds.ok === false) {
        return {
            status: mapDiscordGuildListFailureStatus(discordGuilds.status),
            body: {
                ok: false,
                error: {
                    error: "Discord API request failed.",
                    details: "Discord API request failed.",
                },
            },
        }
    }

    const botClient = tryGetBotClient()
    if (!botClient) {
        const mapped = mapGuildListSetupFailure("bot_not_ready")
        return {
            status: mapped.status,
            body: {
                ok: false,
                error: {
                    error: mapped.error,
                    details: mapped.details,
                },
            },
        }
    }

    const discordUserId = await resolveDiscordUserSnowflake(sessionResult.session.user.id, headers)

    const userGuilds = discordGuilds.guilds
    const botGuilds = botClient.guilds.cache
    const mutualGuilds = userGuilds
        .filter((guild) => botGuilds.has(guild.id))
        .map((guild) => {
            const lavalinkPlayer = botClient.lavalink.getPlayer(guild.id)
            const player = snapshotGuildListPlayer(
                guild.id,
                discordUserId ?? undefined,
                lavalinkPlayer,
                botClient
            )
            return {
                id: guild.id,
                name: guild.name,
                iconUrl: discordGuildIconUrl(guild.id, guild.icon),
                memberCount: botGuilds.get(guild.id)?.memberCount ?? null,
                player,
            }
        })

    const clientId = process.env.CLIENT_ID?.trim() || ""
    const botInviteUrl = clientId
        ? `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(clientId)}&permissions=${DISCORD_BOT_INVITE_PERMISSIONS}&scope=bot%20applications.commands`
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
