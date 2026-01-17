import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
} from "@discordjs/voice"
import fs from "fs"

// Map to store active local players for each guild
const activeLocalPlayers = new Map()

/**
 * Plays a local audio file in the specified voice channel.
 * @param {import('../lib/BotClient.js').default} client
 * @param {import('@lavaclient/queue').Queue} lavalinkPlayer Lavalink player, used for voice channel context if needed.
 * @param {import('discord.js').VoiceBasedChannel} voiceChannel The voice channel to play in.
 * @param {import('discord.js').TextBasedChannel} textChannel The text channel for feedback.
 * @param {{ name: string, path: string, title: string }} localFile The local file to play.
 * @param {import('discord.js').User} requester The user who requested the song.
 * @returns {Promise<{success: boolean, feedbackText: string, error?: Error}>}
 */
export async function playLocalFile(
  client,
  lavalinkPlayer, // We get voiceChannelId and guildId from here or directly
  voiceChannel,
  textChannel,
  localFile,
  requester
) {
  client.debug(
    `[LocalPlayer] Attempting to play local file: "${localFile.title}" in guild ${voiceChannel.guild.id}`
  )

  // Ensure Lavalink player is fully disconnected before @discordjs/voice attempts to connect
  if (lavalinkPlayer) {
    client.debug(`[LocalPlayer] Checking Lavalink player state for guild ${voiceChannel.guild.id}. Connected: ${lavalinkPlayer.connected}, Playing: ${lavalinkPlayer.playing}`)
    if (lavalinkPlayer.playing) {
      try {
        await lavalinkPlayer.stop() // Stop current playback
        client.debug(`[LocalPlayer] Stopped Lavalink player in guild ${voiceChannel.guild.id}.`)
      } catch (e) {
        client.warn(`[LocalPlayer] Failed to stop Lavalink player in guild ${voiceChannel.guild.id}: ${e.message}`)
      }
    }
    // Check if player exists and needs destruction, not just if connected.
    // A player might exist in lavalink.players but not be "connected" yet if a connection attempt was queued.
    if (client.lavalink.players.has(voiceChannel.guild.id)) { // More robust check
      try {
        client.debug(`[LocalPlayer] Attempting to destroy existing Lavalink player for guild ${voiceChannel.guild.id}.`)
        await lavalinkPlayer.destroy() 
        client.debug(`[LocalPlayer] Destroyed Lavalink player for guild ${voiceChannel.guild.id}.`)
        
        // Explicitly delete from the manager's collection
        const deleted = client.lavalink.players.delete(voiceChannel.guild.id)
        if (deleted) {
          client.debug(`[LocalPlayer] Successfully deleted player from Lavalink manager for guild ${voiceChannel.guild.id}.`)
        } else {
          client.warn(`[LocalPlayer] Attempted to delete player from Lavalink manager for guild ${voiceChannel.guild.id}, but it was not found (or delete returned false).`)
        }

      } catch (e) {
        client.warn(`[LocalPlayer] Failed to destroy or delete Lavalink player in guild ${voiceChannel.guild.id}: ${e.message}. Proceeding with @discordjs/voice connection attempt.`)
      }
    } else {
      client.debug(`[LocalPlayer] No Lavalink player found in manager for guild ${voiceChannel.guild.id} prior to local play.`)
    }
  }

  // Add a small delay to allow Discord to process the potential voice state change from Lavalink's destruction
  await new Promise(resolve => setTimeout(resolve, 750)) // Increased delay from 300ms to 750ms

   // If there's an existing local player for this guild, destroy it first
   if (activeLocalPlayers.has(voiceChannel.guild.id)) {
    const oldPlayer = activeLocalPlayers.get(voiceChannel.guild.id)
    oldPlayer.audioPlayer.stop(true) // Stop the audio player
    if (oldPlayer.connection && oldPlayer.connection.state.status !== VoiceConnectionStatus.Destroyed) {
      oldPlayer.connection.destroy() // Destroy the voice connection
    }
    activeLocalPlayers.delete(voiceChannel.guild.id)
    client.debug(`[LocalPlayer] Destroyed previous local player for guild ${voiceChannel.guild.id}`)
  }


  let connection
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

    // Wait for the connection to be ready
    await entersState(connection, VoiceConnectionStatus.Ready, 30_000) // 30s timeout
    client.debug(`[LocalPlayer] Voice connection Ready for guild ${voiceChannel.guild.id}`)
  } catch (error) {
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
      error,
    }
  }

  const audioPlayer = createAudioPlayer()
  activeLocalPlayers.set(voiceChannel.guild.id, {
    audioPlayer,
    connection,
    currentTrack: localFile,
    requesterId: requester?.id,
    startedAt: Date.now(),
  }) // Store player and connection

  const resource = createAudioResource(fs.createReadStream(localFile.path))

  audioPlayer.play(resource)
  connection.subscribe(audioPlayer)

  client.debug(
    `[LocalPlayer] Started playing local file: "${localFile.title}" in guild ${voiceChannel.guild.id}`
  )

  const feedbackText = `Now playing local file: **${localFile.title}** (requested by ${requester})`

  // Handle playback finish
  audioPlayer.once(AudioPlayerStatus.Idle, () => {
    client.debug(
      `[LocalPlayer] Finished playing local file: "${localFile.title}" in guild ${voiceChannel.guild.id}`
    )
    if (connection.state.status !== VoiceConnectionStatus.Destroyed) {
      connection.destroy()
    }
    activeLocalPlayers.delete(voiceChannel.guild.id) // Clean up
    // We could send a message to textChannel here if desired, e.g., "Finished playing {localFile.title}"
  })

  // Handle voice connection errors or disconnects
  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    client.warn(
      `[LocalPlayer] Voice connection Disconnected in guild ${voiceChannel.guild.id}. Attempting to rejoin if possible.`
    )
    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
      ])
      // Connection re-established (or was never truly lost)
    } catch (error) {
      client.error(
        `[LocalPlayer] Voice connection lost or could not reconnect in guild ${voiceChannel.guild.id}:`,
        error
      )
      if (connection.state.status !== VoiceConnectionStatus.Destroyed) {
        connection.destroy()
      }
      audioPlayer.stop(true)
      activeLocalPlayers.delete(voiceChannel.guild.id)
    }
  })

  connection.on(VoiceConnectionStatus.Destroyed, () => {
    client.debug(`[LocalPlayer] Voice connection Destroyed in guild ${voiceChannel.guild.id}. Cleaning up.`)
    audioPlayer.stop(true)
    activeLocalPlayers.delete(voiceChannel.guild.id)
  })

  // Handle audio player errors
  audioPlayer.on("error", (error) => {
    client.error(
      `[LocalPlayer] Error with audio player in guild ${voiceChannel.guild.id} for file "${localFile.title}":`,
      error
    )
    if (connection.state.status !== VoiceConnectionStatus.Destroyed) {
      connection.destroy()
    }
    activeLocalPlayers.delete(voiceChannel.guild.id)
    // We could send an error message to textChannel here
    textChannel.send(`Error playing local file **${localFile.title}**: ${error.message}`).catch(e => client.error("Failed to send error message to text channel", e))

  })

  return { success: true, feedbackText }
}

/**
 * Stops the local player for a specific guild if it's active.
 * @param {import('../lib/BotClient.js').default} client
 * @param {string} guildId
 */
export function stopLocalPlayer(client, guildId) {
  if (activeLocalPlayers.has(guildId)) {
    const playerInstance = activeLocalPlayers.get(guildId)
    playerInstance.audioPlayer.stop(true)
    if (playerInstance.connection && playerInstance.connection.state.status !== VoiceConnectionStatus.Destroyed) {
      playerInstance.connection.destroy()
    }
    activeLocalPlayers.delete(guildId)
    client.debug(`[LocalPlayer] Stopped and cleaned up local player for guild ${guildId}`)
    return true
  }
  return false
}

/**
 * Gets the current state of the local player for a guild.
 * @param {string} guildId 
 * @returns {{isPlaying: boolean, trackTitle?: string} | null}
 */
export function getLocalPlayerState(guildId) {
    if(activeLocalPlayers.has(guildId)) {
        const playerInstance = activeLocalPlayers.get(guildId)
        return {
            isPlaying: playerInstance.audioPlayer.state.status === AudioPlayerStatus.Playing,
            trackTitle: playerInstance.currentTrack?.title,
            requesterId: playerInstance.requesterId,
            startedAt: playerInstance.startedAt
        }
    }
    return null
}
