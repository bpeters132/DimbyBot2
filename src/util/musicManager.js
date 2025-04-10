import { updateControlMessage } from "../events/handlers/handleControlChannel.js"


/**
 * Handles searching, queueing, and starting playback for a music query.
 * @param {import('../lib/BotClient.js').default} client
 * @param {string} guildId
 * @param {import('discord.js').VoiceBasedChannel} voiceChannel The voice channel the user is in.
 * @param {import('discord.js').TextBasedChannel} textChannel The text channel for feedback.
 * @param {string} query The search query.
 * @param {import('discord.js').User} requester The user who requested the music.
 * @param {import('@lavaclient/queue').Queue} player The Lavalink player instance.
 * @returns {Promise<{success: boolean, feedbackText: string, error?: Error}>}
 */
export async function handleQueryAndPlay(
  client,
  guildId,
  voiceChannel, // Pass the actual voice channel object
  textChannel,
  query,
  requester,
  player
) {
  client.debug(`[MusicManager] handleQueryAndPlay called for guild ${guildId}. Query: "${query}"`)
  let feedbackText = ""
  let success = false
  let trackToAdd = null
  let errorResult = null

  try {
    // Ensure player is connected (caller should handle initial connection attempts)
    if (!player.connected) {
      client.debug(
        `[MusicManager] Player not connected for guild ${guildId}. Attempting connect within handleQuery.`
      ) // Log if we need to connect here
      try {
        await player.connect()
        client.debug(
          `[MusicManager] Player successfully connected to VC ${player.voiceChannelId} in guild ${guildId}.`
        )
      } catch (connectError) {
        client.error(
          `[MusicManager] Player failed to connect in guild ${guildId} within handleQuery:`,
          connectError
        )
        return {
          success: false,
          feedbackText: `${requester}, I failed to connect to the voice channel.`,
          error: connectError,
        }
      }
    } else if (player.voiceChannelId !== voiceChannel.id) {
      // This check should ideally happen before calling this function,
      // but double-check just in case.
      client.warn(
        `[MusicManager] User ${requester.id} in VC ${voiceChannel.id}, but player is in VC ${player.voiceChannelId} for guild ${guildId}.`
      ) // Should not happen if called correctly
      return {
        success: false,
        feedbackText: `${requester}, You must be in the same voice channel as me (${client.channels.cache.get(player.voiceChannelId)?.name ?? "Unknown Channel"}).`,
      }
    }

    // 5. Search
    const isUrl = query.startsWith("http://") || query.startsWith("https://") // Basic URL check for logging
    client.debug(
      `[MusicManager] Searching Lavalink for ${isUrl ? 'URL' : 'query'} "${query}" requested by ${requester.id} in guild ${guildId}.` // Log if it looks like a URL
    )
    const searchResult = await player.search({ query: query }, requester)
    client.debug(
      `[MusicManager] Lavalink search completed for guild ${guildId}. Query: "${query}", LoadType: ${searchResult.loadType}` // Include query in result log
    )

    // 6. Handle results
    switch (searchResult.loadType) {
      case "LOAD_FAILED":
        client.warn(
          `[MusicManager] Lavalink search failed for query "${query}" in guild ${guildId}. Error: ${searchResult.exception?.message}`
        )
        feedbackText = `${requester}, I couldn't load results for "${query}". Error: ${searchResult.exception?.message ?? "Unknown error"}`
        errorResult = new Error(searchResult.exception?.message ?? "LOAD_FAILED")
        break
      case "NO_MATCHES":
        client.debug(`[MusicManager] No matches found for query "${query}" in guild ${guildId}.`)
        feedbackText = `${requester}, I couldn't find any tracks for "${query}".`
        break
      case "track": // Handle lowercase variant from plugins like LavaSrc
      case "TRACK_LOADED":
        trackToAdd = searchResult.tracks[0]
        client.debug(
          `[MusicManager] Loaded single track: ${trackToAdd.info.title} in guild ${guildId}. Adding to queue.`
        )
        player.queue.add(trackToAdd)
        feedbackText = `Added [${trackToAdd.info.title}](${trackToAdd.info.uri}) to the queue.`
        success = true
        break
      case "SEARCH_RESULT":
      case "search": // Handle lowercase variant
        trackToAdd = searchResult.tracks[0] // Add the first result
        client.debug(
          `[MusicManager] Found search result: ${trackToAdd.info.title} in guild ${guildId}. Adding first track to queue.`
        )
        player.queue.add(trackToAdd)
        feedbackText = `Added [${trackToAdd.info.title}](${trackToAdd.info.uri}) to the queue.`
        success = true
        break
      case "playlist": // Handle lowercase variant
      case "PLAYLIST_LOADED":
        client.debug(
          `[MusicManager] Loaded playlist: ${searchResult.playlist?.name} (${searchResult.tracks.length} tracks) in guild ${guildId}. Adding to queue.`
        )
        player.queue.add(searchResult.tracks)
        trackToAdd = searchResult.tracks[0] // Need a track to potentially start playback
        feedbackText = `Added playlist **${searchResult.playlist?.name ?? "Unknown Playlist"}** (${searchResult.tracks.length} songs) to the queue.`
        success = true
        break
      default:
        client.warn(
          `[MusicManager] Unknown search result loadType: ${searchResult.loadType} for query "${query}" in guild ${guildId}.`
        )
        feedbackText = `${requester}, An unexpected result type (${searchResult.loadType}) occurred.`
        break
    }
    client.debug(
      `[MusicManager] Search result handling complete for guild ${guildId}. Success: ${success}, Track added: ${!!trackToAdd}.`
    )

    // 7. Start playback if needed
    if (success && trackToAdd && !player.playing && !player.paused) {
      client.debug(
        `[MusicManager] Player not playing/paused and track added. Starting playback for guild ${guildId}.`
      )
      try {
        await player.play()
        client.debug(`[MusicManager] Player successfully started playing in guild ${guildId}.`)
        // Feedback already set by queue add
      } catch (playError) {
        client.error(`[MusicManager] Error starting player in guild ${guildId}:`, playError)
        // Modify existing feedback or create new if necessary
        feedbackText = `${feedbackText} But failed to start playback. Error: ${playError.message}`
        success = false // Playback failed, so overall success is false?
        errorResult = playError
      }
    }

    // 8. Update control message (always update if something was potentially added or state changed)
    if (success || trackToAdd) {
      // Update if succeeded or at least tried to add something
      client.debug(`[MusicManager] Triggering control message update for guild ${guildId}.`)
      await updateControlMessage(client, guildId) // Use imported function
    }

    return { success, feedbackText, error: errorResult }
  } catch (error) {
    client.error(`[MusicManager] Uncaught error in handleQueryAndPlay for guild ${guildId}:`, error)
    return {
      success: false,
      feedbackText: `${requester}, An unexpected error occurred while processing your request.`,
      error: error,
    }
  }
}
