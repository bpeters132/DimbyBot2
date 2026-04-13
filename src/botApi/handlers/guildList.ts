import { PermissionFlagsBits } from "discord.js"
import { auth } from "../../web/auth-node.js"
import { fetchDiscordUserGuilds } from "../../util/discordUserGuilds.js"
import { getAuthenticatedSession } from "../../web/lib/api-auth.js"
import { tryGetBotClient } from "../../lib/botClientRegistry.js"
import type { ApiResponse } from "../../types/index.js"
import type { GuildListResponse } from "../../types/web.js"

/**
 * OAuth2 `permissions` integer for "Add to server": the least bits needed for this codebase.
 * Keep `DISCORD_BOT_INVITE_PERMISSIONS` in `src/web/lib/discord-bot-invite.ts` in sync with this value.
 *
 * Covers voice (Lavalink), control-channel text + embeds + deleting user prompts / cleanup,
 * `/clearmessages` bulk delete, Discord log forwarding (embeds), and dev commands that attach
 * files (`/eval`, `/log-review`).
 */
const BOT_INVITE_PERMISSION_FLAGS =
    PermissionFlagsBits.ViewChannel |
    PermissionFlagsBits.SendMessages |
    PermissionFlagsBits.EmbedLinks |
    PermissionFlagsBits.ManageMessages |
    PermissionFlagsBits.AttachFiles |
    PermissionFlagsBits.ReadMessageHistory |
    PermissionFlagsBits.Connect |
    PermissionFlagsBits.Speak

export const BOT_INVITE_PERMISSIONS = BOT_INVITE_PERMISSION_FLAGS.toString()

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
            client.error("[guildListGET] getAccessToken threw", { message })
        } else {
            console.error("[guildListGET] getAccessToken threw", { message })
        }
        return {
            status: 500,
            body: {
                ok: false,
                error: {
                    error: "Failed to retrieve Discord access token.",
                    details: "Internal server error.",
                },
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
        const client = tryGetBotClient()
        if (client) {
            client.error("[guildListGET] fetchDiscordUserGuilds threw", { message })
        } else {
            console.error("[guildListGET] fetchDiscordUserGuilds threw", { message })
        }
        return {
            status: 502,
            body: {
                ok: false,
                error: {
                    error: "Discord API request failed.",
                    details: "Discord API request failed.",
                },
            },
        }
    }
    if (discordGuilds.ok === false) {
        const upstreamStatus = Number.isFinite(discordGuilds.status) ? discordGuilds.status : 502
        return {
            status: upstreamStatus >= 400 && upstreamStatus <= 599 ? upstreamStatus : 502,
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
        return {
            status: 503,
            body: {
                ok: false,
                error: {
                    error: "Bot is starting up",
                    details:
                        "The Discord bot is not connected yet, so mutual servers cannot be listed. Try again in a moment.",
                },
            },
        }
    }

    const userGuilds = discordGuilds.guilds
    const botGuilds = botClient.guilds.cache
    const mutualGuilds = userGuilds
        .filter((guild) => botGuilds.has(guild.id))
        .map((guild) => ({
            id: guild.id,
            name: guild.name,
            iconUrl: discordGuildIconUrl(guild.id, guild.icon),
            memberCount: botGuilds.get(guild.id)?.memberCount ?? null,
        }))

    const clientId = process.env.CLIENT_ID?.trim() || ""
    const botInviteUrl = clientId
        ? `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(clientId)}&permissions=${BOT_INVITE_PERMISSIONS}&scope=bot%20applications.commands`
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
