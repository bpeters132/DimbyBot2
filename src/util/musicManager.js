import { updateControlMessage } from "../events/handlers/handleControlChannel.js"
import path from "path"
import fs from "fs"


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

    // Try different search strategies
    let searchResult = null
    let searchError = null
    let searchAttempts = []

    // First, check if this is a local file
    const downloadsDir = path.join(process.cwd(), "downloads")
    if (fs.existsSync(downloadsDir)) {
        const files = fs.readdirSync(downloadsDir)
            .filter(file => file.endsWith(".wav"))
            .map(file => ({
                name: file,
                path: path.join(downloadsDir, file),
                title: file.replace(".wav", "").toLowerCase()
            }))

        // Try to find a matching file using fuzzy matching
        const queryLower = query.toLowerCase()
        const matchingFile = files.find(file => {
            // Check if query is contained in the title
            if (file.title.includes(queryLower)) return true
            
            // Check if title is contained in the query
            if (queryLower.includes(file.title)) return true
            
            // Check for word matches
            const queryWords = queryLower.split(/\s+/)
            const titleWords = file.title.split(/\s+/)
            return queryWords.some(word => 
                titleWords.some(titleWord => 
                    titleWord.includes(word) || word.includes(titleWord)
                )
            )
        })

        if (matchingFile) {
            client.debug(`[MusicManager] Found matching local file: ${matchingFile.title}`)
            try {
                // Create a direct file URI for the local file using absolute path
                const absolutePath = path.resolve(matchingFile.path)
                const fileUri = `file://${absolutePath}`
                client.debug(`[MusicManager] Using file URI: ${fileUri}`)
                
                // Create a track object directly
                const track = {
                    info: {
                        title: matchingFile.title,
                        uri: fileUri,
                        sourceName: "local",
                        length: 0,
                        identifier: fileUri,
                        isStream: false,
                        author: "Local File",
                        isSeekable: true
                    },
                    track: fileUri,
                    requester: requester
                }

                // Create a search result object
                searchResult = {
                    loadType: "TRACK_LOADED",
                    tracks: [track],
                    playlistInfo: {}
                }

                searchAttempts.push({ source: 'local', success: true, loadType: searchResult.loadType })
                client.debug(
                    `[MusicManager] Local file loaded for guild ${guildId}. File: "${matchingFile.title}", LoadType: ${searchResult.loadType}`
                )
            } catch (error) {
                searchError = error
                searchAttempts.push({ source: 'local', success: false, error: error.message })
                client.warn(
                    `[MusicManager] Local file load failed for file "${matchingFile.title}" in guild ${guildId}. Error: ${error.message}`
                )
            }
        }
    }

    // If no local file found or local file search failed, try other sources
    if (!searchResult || searchResult.loadType === "LOAD_FAILED" || searchResult.loadType === "NO_MATCHES") {
        // For non-URLs, try direct search first
        if (!isUrl) {
            try {
                // Format the search query properly
                const searchQuery = query.trim().replace(/\s+/g, ' ')
                // Use direct search without any source specification
                searchResult = await player.search(searchQuery, requester)
                searchAttempts.push({ source: 'direct', success: true, loadType: searchResult.loadType })
                client.debug(
                    `[MusicManager] Direct search completed for guild ${guildId}. Query: "${searchQuery}", LoadType: ${searchResult.loadType}`
                )
            } catch (error) {
                searchError = error
                searchAttempts.push({ source: 'direct', success: false, error: error.message })
                client.warn(
                    `[MusicManager] Direct search failed for query "${query}" in guild ${guildId}. Error: ${error.message}`
                )
            }
        } else {
            // For URLs, try direct search
            try {
                searchResult = await player.search(query, requester)
                searchAttempts.push({ source: 'direct', success: true, loadType: searchResult.loadType })
                client.debug(
                    `[MusicManager] Direct search completed for guild ${guildId}. Query: "${query}", LoadType: ${searchResult.loadType}`
                )
            } catch (error) {
                searchError = error
                searchAttempts.push({ source: 'direct', success: false, error: error.message })
                client.warn(
                    `[MusicManager] Direct search failed for query "${query}" in guild ${guildId}. Error: ${error.message}`
                )
            }
        }
    }

    // If search failed, try Spotify as last resort
    if (!searchResult || searchResult.loadType === "LOAD_FAILED" || searchResult.loadType === "NO_MATCHES") {
      try {
        searchResult = await player.search(query, requester)
        searchAttempts.push({ source: 'spotify', success: true, loadType: searchResult.loadType })
        client.debug(
          `[MusicManager] Spotify search completed for guild ${guildId}. Query: "${query}", LoadType: ${searchResult.loadType}`
        )
      } catch (error) {
        searchAttempts.push({ source: 'spotify', success: false, error: error.message })
        client.warn(
          `[MusicManager] Spotify search failed for query "${query}" in guild ${guildId}. Error: ${error.message}`
        )
      }
    }

    // If all searches failed, return detailed error
    if (!searchResult || searchResult.loadType === "LOAD_FAILED" || searchResult.loadType === "NO_MATCHES") {
      client.warn(
        `[MusicManager] All search attempts failed for query "${query}" in guild ${guildId}. Attempts: ${JSON.stringify(searchAttempts)}`
      )
      
      // Build detailed error message
      let errorDetails = "Search attempts:\n"
      searchAttempts.forEach((attempt, index) => {
        errorDetails += `${index + 1}. ${attempt.source}: ${attempt.success ? 'Success' : 'Failed'}`
        if (!attempt.success && attempt.error) {
          errorDetails += ` (${attempt.error})`
        }
        if (attempt.loadType) {
          errorDetails += ` [${attempt.loadType}]`
        }
        errorDetails += "\n"
      })

      feedbackText = `${requester}, I couldn't find any playable tracks for "${query}".\n${errorDetails}`
      errorResult = searchError || new Error("All search attempts failed")
      return { success: false, feedbackText, error: errorResult }
    }

    // 6. Handle results
    switch (searchResult.loadType) {
      case "LOAD_FAILED":
        client.warn(
          `[MusicManager] Lavalink search failed for query "${query}" in guild ${guildId}. Error: ${searchResult.exception?.message}`
        )
        feedbackText = `${requester}, I couldn't load results for "${query}".\nError: ${searchResult.exception?.message ?? "Unknown error"}\nSource: ${searchResult.tracks[0]?.info?.sourceName ?? "Unknown"}`
        errorResult = new Error(searchResult.exception?.message ?? "LOAD_FAILED")
        break
      case "NO_MATCHES":
        client.debug(`[MusicManager] No matches found for query "${query}" in guild ${guildId}.`)
        feedbackText = `${requester}, I couldn't find any tracks for "${query}".\nTried sources: ${searchAttempts.map(a => a.source).join(", ")}`
        break
      case "track": // Handle lowercase variant from plugins like LavaSrc
      case "TRACK_LOADED":
        trackToAdd = searchResult.tracks[0]
        client.debug(
          `[MusicManager] Loaded single track: ${trackToAdd.info.title} in guild ${guildId}. Adding to queue.`
        )
        // Ensure the track has the correct format
        if (!trackToAdd.track) {
            trackToAdd.track = trackToAdd.info.uri
        }
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
        // Pass the track to play() to ensure it's used
        await player.play({ track: trackToAdd })
        client.debug(`[MusicManager] Player successfully started playing in guild ${guildId}.`)
        // Feedback already set by queue add
      } catch (playError) {
        client.error(`[MusicManager] Error starting player in guild ${guildId}:`, playError)
        
        // Check for specific error cases
        if (playError.message?.includes("No supported audio streams available")) {
          feedbackText = `${requester}, I couldn't play this video because it has no supported audio streams.\n\nPossible reasons:\n- Video is age-restricted\n- Video is region-locked\n- Video has been removed or made private\n- Video's audio format is not supported\n\nTrack info:\nTitle: ${trackToAdd.info.title}\nSource: ${trackToAdd.info.sourceName}\nURI: ${trackToAdd.info.uri}`
          // Don't destroy the player, just skip the track
          if (player.queue.tracks.length > 0) {
            player.skip()
            feedbackText += "\n\nSkipping to next track in queue..."
          }
        } else {
          // For other errors, provide detailed feedback
          feedbackText = `${requester}, Failed to start playback.\n\nError: ${playError.message}\nTrack: ${trackToAdd.info.title}\nSource: ${trackToAdd.info.sourceName}\nURI: ${trackToAdd.info.uri}`
        }
        success = false
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
