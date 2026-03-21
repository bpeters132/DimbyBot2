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
import type { ActiveLocalPlayer, LocalFile, LocalPlayerState, QueryPlayResult } from "../types/index.js"

const activeLocalPlayers = new Map<string, ActiveLocalPlayer>()

export async function playLocalFile(
  client: BotClient,
  lavalinkPlayer: Player | null | undefined,
  voiceChannel: VoiceBasedChannel,
  textChannel: TextBasedChannel,
  localFile: LocalFile,
  requester: User | undefined
): Promise<QueryPlayResult> {
  client.debug(
    `[LocalPlayer] Attempting to play local file: "${localFile.title}" in guild ${voiceChannel.guild.id}`
  )

  if (lavalinkPlayer) {
    client.debug(
      `[LocalPlayer] Checking Lavalink player state for guild ${voiceChannel.guild.id}. Connected: ${lavalinkPlayer.connected}, Playing: ${lavalinkPlayer.playing}`
    )
    if (lavalinkPlayer.playing) {
      try {
        await lavalinkPlayer.stopPlaying(true, false)
        client.debug(`[LocalPlayer] Stopped Lavalink player in guild ${voiceChannel.guild.id}.`)
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        client.warn(`[LocalPlayer] Failed to stop Lavalink player in guild ${voiceChannel.guild.id}: ${msg}`)
      }
    }
    if (client.lavalink.players.has(voiceChannel.guild.id)) {
      try {
        client.debug(
          `[LocalPlayer] Attempting to destroy existing Lavalink player for guild ${voiceChannel.guild.id}.`
        )
        await lavalinkPlayer.destroy()
        client.debug(`[LocalPlayer] Destroyed Lavalink player for guild ${voiceChannel.guild.id}.`)

        const deleted = client.lavalink.players.delete(voiceChannel.guild.id)
        if (deleted) {
          client.debug(
            `[LocalPlayer] Successfully deleted player from Lavalink manager for guild ${voiceChannel.guild.id}.`
          )
        } else {
          client.warn(
            `[LocalPlayer] Attempted to delete player from Lavalink manager for guild ${voiceChannel.guild.id}, but it was not found (or delete returned false).`
          )
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        client.warn(
          `[LocalPlayer] Failed to destroy or delete Lavalink player in guild ${voiceChannel.guild.id}: ${msg}. Proceeding with @discordjs/voice connection attempt.`
        )
      }
    } else {
      client.debug(
        `[LocalPlayer] No Lavalink player found in manager for guild ${voiceChannel.guild.id} prior to local play.`
      )
    }
  }

  await new Promise((resolve) => setTimeout(resolve, 750))

  if (activeLocalPlayers.has(voiceChannel.guild.id)) {
    const oldPlayer = activeLocalPlayers.get(voiceChannel.guild.id)!
    oldPlayer.audioPlayer.stop(true)
    if (oldPlayer.connection && oldPlayer.connection.state.status !== VoiceConnectionStatus.Destroyed) {
      oldPlayer.connection.destroy()
    }
    activeLocalPlayers.delete(voiceChannel.guild.id)
    client.debug(`[LocalPlayer] Destroyed previous local player for guild ${voiceChannel.guild.id}`)
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
      `[LocalPlayer] Joined voice channel: ${voiceChannel.name} (${voiceChannel.id}) in guild ${voiceChannel.guild.id}`
    )

    await entersState(connection, VoiceConnectionStatus.Ready, 30_000)
    client.debug(`[LocalPlayer] Voice connection Ready for guild ${voiceChannel.guild.id}`)
  } catch (error: unknown) {
    client.error(
      `[LocalPlayer] Failed to join or get ready in voice channel ${voiceChannel.id} for guild ${voiceChannel.guild.id}:`,
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

  const audioPlayer = createAudioPlayer()
  activeLocalPlayers.set(voiceChannel.guild.id, {
    audioPlayer,
    connection: connection!,
    currentTrack: localFile,
    requesterId: requester?.id,
    startedAt: Date.now(),
  })

  const resource = createAudioResource(fs.createReadStream(localFile.path))

  audioPlayer.play(resource)
  connection!.subscribe(audioPlayer)

  client.debug(
    `[LocalPlayer] Started playing local file: "${localFile.title}" in guild ${voiceChannel.guild.id}`
  )

  const safeRequester = requester ?? "someone"
  const feedbackText = `Now playing local file: **${localFile.title}** (requested by ${safeRequester})`

  const conn = connection!

  audioPlayer.once(AudioPlayerStatus.Idle, () => {
    client.debug(
      `[LocalPlayer] Finished playing local file: "${localFile.title}" in guild ${voiceChannel.guild.id}`
    )
    if (conn.state.status !== VoiceConnectionStatus.Destroyed) {
      conn.destroy()
    }
    activeLocalPlayers.delete(voiceChannel.guild.id)
  })

  conn.on(VoiceConnectionStatus.Disconnected, async () => {
    client.warn(
      `[LocalPlayer] Voice connection Disconnected in guild ${voiceChannel.guild.id}. Attempting to rejoin if possible.`
    )
    try {
      await Promise.race([
        entersState(conn, VoiceConnectionStatus.Signalling, 5_000),
        entersState(conn, VoiceConnectionStatus.Connecting, 5_000),
      ])
    } catch (error: unknown) {
      client.error(
        `[LocalPlayer] Voice connection lost or could not reconnect in guild ${voiceChannel.guild.id}:`,
        error
      )
      if (conn.state.status !== VoiceConnectionStatus.Destroyed) {
        conn.destroy()
      }
      audioPlayer.stop(true)
      activeLocalPlayers.delete(voiceChannel.guild.id)
    }
  })

  conn.on(VoiceConnectionStatus.Destroyed, () => {
    client.debug(`[LocalPlayer] Voice connection Destroyed in guild ${voiceChannel.guild.id}. Cleaning up.`)
    audioPlayer.stop(true)
    activeLocalPlayers.delete(voiceChannel.guild.id)
  })

  audioPlayer.on("error", (error: Error) => {
    client.error(
      `[LocalPlayer] Error with audio player in guild ${voiceChannel.guild.id} for file "${localFile.title}":`,
      error
    )
    if (conn.state.status !== VoiceConnectionStatus.Destroyed) {
      conn.destroy()
    }
    activeLocalPlayers.delete(voiceChannel.guild.id)
    ;(textChannel as import("discord.js").TextChannel)
      .send(`Error playing local file **${localFile.title}**: ${error.message}`)
      .catch((e: unknown) => client.error("Failed to send error message to text channel", e))
  })

  return { success: true, feedbackText }
}

export function stopLocalPlayer(client: BotClient, guildId: string) {
  if (activeLocalPlayers.has(guildId)) {
    const playerInstance = activeLocalPlayers.get(guildId)!
    playerInstance.audioPlayer.stop(true)
    if (
      playerInstance.connection &&
      playerInstance.connection.state.status !== VoiceConnectionStatus.Destroyed
    ) {
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
