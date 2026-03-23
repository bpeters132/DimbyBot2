import {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    VoiceConnectionStatus,
    entersState,
    type VoiceConnection,
} from "@discordjs/voice"
import type { Player } from "lavalink-client"
import type { TextBasedChannel, User, VoiceBasedChannel } from "discord.js"
import fs from "fs"
import type BotClient from "../lib/BotClient.js"
import type {
    ActiveLocalPlayer,
    LocalFile,
    LocalPlayerState,
    QueryPlayResult,
} from "../types/index.js"

const activeLocalPlayers = new Map<string, ActiveLocalPlayer>()
const pendingLocalPlayGuildIds = new Set<string>()

/** Resolves when Lavalink emits `playerDestroy` for the guild or after `timeoutMs` (teardown handoff). */
function waitForLavalinkPlayerDestroy(
    client: BotClient,
    guildId: string,
    timeoutMs: number
): Promise<void> {
    return new Promise((resolve) => {
        let settled = false
        const finish = () => {
            if (settled) return
            settled = true
            clearTimeout(timer)
            client.lavalink.off("playerDestroy", onDestroy)
            resolve()
        }
        const onDestroy = (p: Player) => {
            if (p.guildId !== guildId) return
            finish()
        }
        const timer = setTimeout(finish, timeoutMs)
        client.lavalink.on("playerDestroy", onDestroy)
    })
}

export async function playLocalFile(
    client: BotClient,
    lavalinkPlayer: Player | null | undefined,
    voiceChannel: VoiceBasedChannel,
    textChannel: TextBasedChannel,
    localFile: LocalFile,
    requester: User | undefined
): Promise<QueryPlayResult> {
    const guildId = voiceChannel.guild.id
    client.debug(
        `[LocalPlayer] Attempting to play local file: "${localFile.title}" in guild ${guildId}`
    )

    try {
        await fs.promises.access(localFile.path, fs.constants.R_OK)
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        client.debug(`[LocalPlayer] Local file not readable: ${localFile.path} (${msg})`)
        return {
            success: false,
            feedbackText: `I couldn't read the local file **${localFile.title}**. It may be missing or inaccessible.`,
            error: e instanceof Error ? e : new Error(String(e)),
        }
    }

    if (pendingLocalPlayGuildIds.has(guildId)) {
        return {
            success: false,
            feedbackText:
                "Local playback is already starting in this server. Please wait a moment.",
            error: new Error("pending local play"),
        }
    }
    pendingLocalPlayGuildIds.add(guildId)

    let postLavalinkHandoff: Promise<void> = new Promise((r) => queueMicrotask(r))

    if (lavalinkPlayer) {
        client.debug(
            `[LocalPlayer] Checking Lavalink player state for guild ${guildId}. Connected: ${lavalinkPlayer.connected}, Playing: ${lavalinkPlayer.playing}`
        )
        if (lavalinkPlayer.playing) {
            try {
                await lavalinkPlayer.stopPlaying(true, false)
                client.debug(`[LocalPlayer] Stopped Lavalink player in guild ${guildId}.`)
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : String(e)
                client.warn(
                    `[LocalPlayer] Failed to stop Lavalink player in guild ${guildId}: ${msg}`
                )
            }
        }
        if (client.lavalink.players.has(guildId)) {
            postLavalinkHandoff = waitForLavalinkPlayerDestroy(client, guildId, 2000)
            try {
                client.debug(
                    `[LocalPlayer] Attempting to destroy existing Lavalink player for guild ${guildId}.`
                )
                await lavalinkPlayer.destroy()
                client.debug(`[LocalPlayer] Destroyed Lavalink player for guild ${guildId}.`)

                const deleted = client.lavalink.players.delete(guildId)
                if (deleted) {
                    client.debug(
                        `[LocalPlayer] Successfully deleted player from Lavalink manager for guild ${guildId}.`
                    )
                } else {
                    client.warn(
                        `[LocalPlayer] Attempted to delete player from Lavalink manager for guild ${guildId}, but it was not found (or delete returned false).`
                    )
                }
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : String(e)
                client.warn(
                    `[LocalPlayer] Failed to destroy or delete Lavalink player in guild ${guildId}: ${msg}. Proceeding with @discordjs/voice connection attempt.`
                )
            }
        } else {
            client.debug(
                `[LocalPlayer] No Lavalink player found in manager for guild ${guildId} prior to local play.`
            )
        }
    }

    try {
        await postLavalinkHandoff

        if (activeLocalPlayers.has(guildId)) {
            const oldPlayer = activeLocalPlayers.get(guildId)!
            oldPlayer.audioPlayer.stop(true)
            if (
                oldPlayer.connection &&
                oldPlayer.connection.state.status !== VoiceConnectionStatus.Destroyed
            ) {
                if (oldPlayer.onDisconnected) {
                    oldPlayer.connection.off(
                        VoiceConnectionStatus.Disconnected,
                        oldPlayer.onDisconnected
                    )
                }
                oldPlayer.connection.destroy()
            }
            activeLocalPlayers.delete(guildId)
            client.debug(`[LocalPlayer] Destroyed previous local player for guild ${guildId}`)
        }

        let connection: VoiceConnection | undefined
        try {
            connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: voiceChannel.guild.id,
                adapterCreator: voiceChannel.guild.voiceAdapterCreator,
                selfDeaf: true,
            })

            client.debug(
                `[LocalPlayer] Joined voice channel: ${voiceChannel.name} (${voiceChannel.id}) in guild ${guildId}`
            )

            await entersState(connection, VoiceConnectionStatus.Ready, 30_000)
            client.debug(`[LocalPlayer] Voice connection Ready for guild ${guildId}`)
        } catch (error: unknown) {
            client.error(
                `[LocalPlayer] Failed to join or get ready in voice channel ${voiceChannel.id} for guild ${guildId}:`,
                error
            )
            if (connection && connection.state.status !== VoiceConnectionStatus.Destroyed) {
                connection.destroy()
            }
            return {
                success: false,
                feedbackText: "I couldn't connect to your voice channel to play the local file.",
                error: error instanceof Error ? error : new Error(String(error)),
            }
        }

        const conn = connection!
        const audioPlayer = createAudioPlayer()
        const onDisconnected = () => {
            void (async () => {
                client.warn(
                    `[LocalPlayer] Voice connection Disconnected in guild ${guildId}. Attempting to rejoin if possible.`
                )
                try {
                    await Promise.race([
                        entersState(conn, VoiceConnectionStatus.Signalling, 5_000),
                        entersState(conn, VoiceConnectionStatus.Connecting, 5_000),
                    ])
                    client.debug(
                        `[LocalPlayer] Voice connection re-entered Signalling/Connecting for guild ${guildId}; rejoin in progress.`
                    )
                } catch (error: unknown) {
                    client.error(
                        `[LocalPlayer] Voice connection lost or could not reconnect in guild ${guildId}:`,
                        error
                    )
                    if (conn.state.status !== VoiceConnectionStatus.Destroyed) {
                        conn.destroy()
                    }
                    audioPlayer.stop(true)
                    activeLocalPlayers.delete(guildId)
                }
            })()
        }

        activeLocalPlayers.set(guildId, {
            audioPlayer,
            connection: conn,
            onDisconnected,
            currentTrack: localFile,
            requesterId: requester?.id,
            startedAt: Date.now(),
        })

        const resource = createAudioResource(fs.createReadStream(localFile.path))

        audioPlayer.play(resource)
        conn.subscribe(audioPlayer)

        client.debug(
            `[LocalPlayer] Started playing local file: "${localFile.title}" in guild ${guildId}`
        )

        const safeRequester = requester ?? "someone"
        const feedbackText = `Now playing local file: **${localFile.title}** (requested by ${safeRequester})`

        audioPlayer.once(AudioPlayerStatus.Idle, () => {
            client.debug(
                `[LocalPlayer] Finished playing local file: "${localFile.title}" in guild ${guildId}`
            )
            if (conn.state.status !== VoiceConnectionStatus.Destroyed) {
                conn.destroy()
            }
            activeLocalPlayers.delete(guildId)
        })

        conn.on(VoiceConnectionStatus.Disconnected, onDisconnected)

        conn.once(VoiceConnectionStatus.Destroyed, () => {
            conn.off(VoiceConnectionStatus.Disconnected, onDisconnected)
            client.debug(
                `[LocalPlayer] Voice connection Destroyed in guild ${guildId}. Cleaning up.`
            )
            audioPlayer.stop(true)
            activeLocalPlayers.delete(guildId)
        })

        audioPlayer.on("error", (error: Error) => {
            client.error(
                `[LocalPlayer] Error with audio player in guild ${guildId} for file "${localFile.title}":`,
                error
            )
            if (conn.state.status !== VoiceConnectionStatus.Destroyed) {
                conn.destroy()
            }
            activeLocalPlayers.delete(guildId)
            const sendable = textChannel as TextBasedChannel & {
                send: (content: string) => Promise<unknown>
            }
            sendable
                .send(
                    `An error occurred while playing **${localFile.title}**. Please try again or re-download the file.`
                )
                .catch((e: unknown) =>
                    client.error("Failed to send error message to text channel", e)
                )
        })

        return { success: true, feedbackText }
    } finally {
        pendingLocalPlayGuildIds.delete(guildId)
    }
}

export function stopLocalPlayer(client: BotClient, guildId: string) {
    if (activeLocalPlayers.has(guildId)) {
        const playerInstance = activeLocalPlayers.get(guildId)!
        playerInstance.audioPlayer.stop(true)
        if (
            playerInstance.connection &&
            playerInstance.connection.state.status !== VoiceConnectionStatus.Destroyed
        ) {
            if (playerInstance.onDisconnected) {
                playerInstance.connection.off(
                    VoiceConnectionStatus.Disconnected,
                    playerInstance.onDisconnected
                )
            }
            playerInstance.connection.destroy()
        }
        activeLocalPlayers.delete(guildId)
        client.debug(`[LocalPlayer] Stopped and cleaned up local player for guild ${guildId}`)
        return true
    }
    return false
}

export function getLocalPlayerState(guildId: string): LocalPlayerState | null {
    if (activeLocalPlayers.has(guildId)) {
        const playerInstance = activeLocalPlayers.get(guildId)!
        return {
            isPlaying: playerInstance.audioPlayer.state.status === AudioPlayerStatus.Playing,
            trackTitle: playerInstance.currentTrack?.title,
            requesterId: playerInstance.requesterId,
            startedAt: playerInstance.startedAt,
        }
    }
    return null
}
