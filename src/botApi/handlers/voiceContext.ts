import { getAuthenticatedSession } from "../../shared/api-auth.js"
import { resolveDiscordUserSnowflake } from "../../shared/discord-user-id.js"
import { isPlayer, summarizeVoiceForWeb } from "../../shared/player-state.js"
import { getBotClient, tryGetBotClient } from "../../lib/botClientRegistry.js"
import type { ApiResponse } from "../../types/index.js"
import type { VoiceContextResponse } from "../../types/web.js"

function discordGuildIconUrl(guildId: string, icon: string | null | undefined): string | null {
    if (!icon) return null
    return `https://cdn.discordapp.com/icons/${guildId}/${icon}.png?size=128`
}

function isActivePlayerSession(player: unknown): boolean {
    if (!isPlayer(player)) return false
    if (player.playing || player.paused) return true
    if (player.queue?.current) return true
    return (player.queue?.tracks?.length ?? 0) > 0
}

/** Guild where the viewer shares a VC with the bot and the bot has an active player session. */
export async function voiceContextGET(
    headers: Headers
): Promise<{ status: number; body: ApiResponse<VoiceContextResponse> }> {
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

    const discordUserId = await resolveDiscordUserSnowflake(
        sessionResult.session.user.id,
        headers
    )
    if (!discordUserId) {
        return {
            status: 403,
            body: {
                ok: false,
                error: {
                    error: "Discord account required",
                    details: "Could not resolve your Discord user id.",
                },
            },
        }
    }

    const client = tryGetBotClient()
    if (!client) {
        return {
            status: 503,
            body: {
                ok: false,
                error: {
                    error: "Bot is starting up",
                    details: "The Discord bot is not connected yet.",
                },
            },
        }
    }

    type Candidate = {
        guildId: string
        guildName: string
        guildIconUrl: string | null
        status: "playing" | "paused" | "idle"
        currentTrackTitle: string | null
        priority: number
    }

    const candidates: Candidate[] = []
    const bot = getBotClient()

    for (const player of bot.lavalink.players.values()) {
        const guildId = player.guildId
        const voice = summarizeVoiceForWeb(guildId, discordUserId, player, client)
        if (!voice.inVoiceWithBot || !isActivePlayerSession(player)) {
            continue
        }

        const guild = client.guilds.cache.get(guildId)
        const status = player.playing ? "playing" : player.paused ? "paused" : "idle"
        const priority = status === "playing" ? 0 : status === "paused" ? 1 : 2
        const current = player.queue?.current ?? null
        const currentTrackTitle =
            current && typeof current.info?.title === "string" ? current.info.title : null

        candidates.push({
            guildId,
            guildName: guild?.name ?? "Server",
            guildIconUrl: discordGuildIconUrl(guildId, guild?.icon ?? null),
            status,
            currentTrackTitle,
            priority,
        })
    }

    candidates.sort((a, b) => a.priority - b.priority)
    const best = candidates[0] ?? null

    return {
        status: 200,
        body: {
            ok: true,
            data: {
                activeGuild: best
                    ? {
                          guildId: best.guildId,
                          guildName: best.guildName,
                          guildIconUrl: best.guildIconUrl,
                          status: best.status,
                          currentTrackTitle: best.currentTrackTitle,
                      }
                    : null,
            },
        },
    }
}
