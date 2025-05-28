import { updateControlMessage } from "../events/handlers/handleControlChannel.js"
import path from "path"
import fs from "fs"
import { playLocalFile } from "./localPlayer.js"
import { getLocalPlayerState, stopLocalPlayer } from "./localPlayer.js"
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from "discord.js"

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
  let localFilePlayed = false
  let searchResult = null
  let searchError = null
  let searchAttempts = []

  try {
    if (player.voiceChannelId && player.voiceChannelId !== voiceChannel.id && player.connected) {
      client.warn(
        `[MusicManager] Player is in VC ${player.voiceChannelId}, but user ${requester.id} is in VC ${voiceChannel.id} for guild ${guildId}. Attempting to move player.`
      )
    }

    const isUrl = query.startsWith("http://") || query.startsWith("https://")
    let potentialUrlTrackInfo = null
    let stringForLocalSearch = query
    let localMatchSourceIsUrlTitle = false

    if (isUrl) {
      try {
        client.debug(`[MusicManager] Query is a URL. Probing Lavalink for title: "${query}"`)
        const probeResult = await player.search(query, requester)
        if (
          probeResult &&
          (probeResult.loadType === "track" || probeResult.loadType === "TRACK_LOADED") &&
          probeResult.tracks.length > 0
        ) {
          potentialUrlTrackInfo = probeResult.tracks[0]
          stringForLocalSearch = potentialUrlTrackInfo.info.title
          localMatchSourceIsUrlTitle = true
          client.debug(
            `[MusicManager] URL Probe Success. Using title for local search: "${stringForLocalSearch}"`
          )
        } else {
          client.debug(
            `[MusicManager] URL Probe did not yield a usable track title. LoadType: ${probeResult?.loadType}. Will use original URL for Lavalink search if no direct local match.`
          )
          stringForLocalSearch = query
        }
      } catch (urlProbeError) {
        client.warn(
          `[MusicManager] Error probing URL "${query}" for title: ${urlProbeError.message}. Will use original URL.`
        )
        stringForLocalSearch = query
      }
    } else {
      client.debug(
        `[MusicManager] Query is not a URL. Using original query for local search: "${stringForLocalSearch}"`
      )
    }

    const downloadsDir = path.join(process.cwd(), "downloads")
    let matchingFile = null

    if (fs.existsSync(downloadsDir)) {
      const files = fs
        .readdirSync(downloadsDir)
        .filter((file) => file.endsWith(".wav"))
        .map((f) => ({
          name: f,
          path: path.join(downloadsDir, f),
          title: f.replace(/\.wav$/, "").toLowerCase(),
        }))

      const queryLower = stringForLocalSearch.toLowerCase()
      const queryWords = queryLower.split(/\s+/).filter((word) => word.length > 0)
      if (queryWords.length > 0) {
        matchingFile = files.find((fileEntry) => {
          const titleWords = fileEntry.title.split(/\s+/).filter((word) => word.length > 0)
          return queryWords.every((qw) =>
            titleWords.some((tw) => tw.includes(qw) || qw.includes(tw))
          )
        })
      }
    }

    if (matchingFile) {
      client.debug(
        `[MusicManager] Found matching local file: "${matchingFile.title}" for search string "${stringForLocalSearch}" (Source was URL title: ${localMatchSourceIsUrlTitle})`
      )

      let confirmationContent = `${requester}, `
      if (localMatchSourceIsUrlTitle && potentialUrlTrackInfo) {
        confirmationContent += `The URL you provided (for track: **${potentialUrlTrackInfo.info.title.substring(0, 80)}${potentialUrlTrackInfo.info.title.length > 80 ? "..." : ""}**) seems to match a local file: **${matchingFile.title}**.`
      } else {
        confirmationContent += `I found a local file matching your query "${query}": **${matchingFile.title}**.`
      }

      const lavalinkPlayerActive = player && (player.playing || player.queue.size > 0)

      if (lavalinkPlayerActive) {
        confirmationContent += `\n\nChoosing **Play Local File** will **stop the current online music and clear its queue**.`
        confirmationContent += `\nChoosing **Search Online Instead** will ${localMatchSourceIsUrlTitle && potentialUrlTrackInfo ? "play/queue the content from the URL" : `add your query "${query}" to the current online queue`}.`
      } else {
        confirmationContent += `\n\nWould you like to play this local file or ${localMatchSourceIsUrlTitle && potentialUrlTrackInfo ? "play/queue the content from the URL" : `search online for "${query}"`}?`
      }

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("play_local_confirmed")
          .setLabel(
            `Play Local: ${matchingFile.title.substring(0, 70)}${matchingFile.title.length > 70 ? "..." : ""}`
          )
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId("search_online_instead")
          .setLabel(
            localMatchSourceIsUrlTitle && potentialUrlTrackInfo
              ? "Use URL Content"
              : "Search Online Instead"
          )
          .setStyle(ButtonStyle.Secondary)
      )

      const confirmationMessage = await textChannel.send({
        content: confirmationContent,
        components: [row],
      })

      try {
        const buttonInteraction = await confirmationMessage.awaitMessageComponent({
          filter: (i) =>
            i.user.id === requester.id &&
            (i.customId === "play_local_confirmed" || i.customId === "search_online_instead"),
          componentType: ComponentType.Button,
          time: 30000,
        })

        await buttonInteraction.deferUpdate()
        await confirmationMessage
          .delete()
          .catch((e) =>
            client.warn(`[MusicManager] Failed to delete confirmation message: ${e.message}`)
          )

        if (buttonInteraction.customId === "play_local_confirmed") {
          client.debug(
            `[MusicManager] User ${requester.id} confirmed to play local file: ${matchingFile.title}`
          )
          const localPlayResult = await playLocalFile(
            client,
            player,
            voiceChannel,
            textChannel,
            matchingFile,
            requester
          )
          localFilePlayed = true
          if (localPlayResult.success) {
            return { ...localPlayResult, success: true }
          } else {
            return {
              ...localPlayResult,
              success: false,
              error: localPlayResult.error || new Error("Local playback failed"),
            }
          }
        } else {
          // "search_online_instead"
          client.debug(
            `[MusicManager] User ${requester.id} chose to search online/use URL instead of local file: ${matchingFile.title}`
          )
          if (localMatchSourceIsUrlTitle && potentialUrlTrackInfo) {
            searchResult = {
              loadType: "TRACK_LOADED",
              tracks: [potentialUrlTrackInfo],
              playlist: null,
              exception: null,
            }
            client.debug(
              `[MusicManager] Using pre-fetched track info for URL: ${potentialUrlTrackInfo.info.title}`
            )
            feedbackText = `${requester}, Proceeding with content from URL: [${potentialUrlTrackInfo.info.title}](${potentialUrlTrackInfo.info.uri})`
          } else {
            feedbackText = `${requester}, Understood. Searching online for "${query}"...`
          }
        }
      } catch (error) {
        // Timeout
        client.debug(
          `[MusicManager] No response for local file confirmation. Defaulting to online search/URL. Error: ${error.message}`
        )
        await confirmationMessage
          .delete()
          .catch((e) =>
            client.warn(
              `[MusicManager] Failed to delete confirmation message on timeout: ${e.message}`
            )
          )
        if (localMatchSourceIsUrlTitle && potentialUrlTrackInfo) {
          searchResult = {
            loadType: "TRACK_LOADED",
            tracks: [potentialUrlTrackInfo],
            playlist: null,
            exception: null,
          }
          feedbackText = `${requester}, No selection made. Proceeding with content from URL: [${potentialUrlTrackInfo.info.title}](${potentialUrlTrackInfo.info.uri})`
          client.debug(
            `[MusicManager] Timeout. Using pre-fetched track info for URL: ${potentialUrlTrackInfo.info.title}`
          )
        } else {
          feedbackText = `${requester}, No selection made. Proceeding to search online for "${query}".`
        }
      }
    }

    if (localFilePlayed) {
      client.debug(
        "[MusicManager] localFilePlayed is true. No further Lavalink action needed in this path."
      )
      return { success: true, feedbackText, error: errorResult }
    }

    const currentLocalPlayerState = getLocalPlayerState(guildId)
    if (currentLocalPlayerState && currentLocalPlayerState.isPlaying) {
      client.debug(
        `[MusicManager] Active local player found in guild ${guildId}. Stopping it before Lavalink playback.`
      )
      if (stopLocalPlayer(client, guildId)) {
        client.debug(
          `[MusicManager] Successfully stopped active local player in guild ${guildId}. Pausing for 500ms.`
        )
        await new Promise((resolve) => setTimeout(resolve, 500))
        client.debug(
          `[MusicManager] Re-validating Lavalink player for guild ${guildId} after stopping local player.`
        )
        let newPlayerInstance = client.lavalink.getPlayer(guildId)
        if (!newPlayerInstance) {
          client.warn(
            `[MusicManager] Lavalink player for guild ${guildId} was destroyed or not found. Creating a new one.`
          )
          newPlayerInstance = client.lavalink.createPlayer({
            guildId: guildId,
            voiceChannelId: voiceChannel.id,
            textChannelId: textChannel.id,
            selfDeaf: true,
            volume: 100,
          })
          client.debug(
            `[MusicManager] New Lavalink player created. Initial State - Connected: ${newPlayerInstance.connected}, VC: ${newPlayerInstance.voiceChannelId}`
          )
        } else {
          client.debug(
            `[MusicManager] Existing Lavalink player found. State - Connected: ${newPlayerInstance.connected}, VC: ${newPlayerInstance.voiceChannelId}. Ensuring target VC.`
          )
          newPlayerInstance.voiceChannelId = voiceChannel.id
          newPlayerInstance.textChannelId = textChannel.id
        }
        player = newPlayerInstance
      } else {
        client.warn(
          `[MusicManager] Failed to stop local player in guild ${guildId}. Proceeding with Lavalink with potential conflict.`
        )
      }
    }

    if (!searchResult) {
      client.debug(`[MusicManager] Performing main Lavalink search for query: "${query}"`)
      searchAttempts = []
      searchError = null

      if (!isUrl) {
        try {
          const searchQuery = query.trim().replace(/\s+/g, " ")
          searchResult = await player.search(searchQuery, requester)
          searchAttempts.push({ source: "direct", success: true, loadType: searchResult.loadType })
          client.debug(
            `[MusicManager] Direct search (non-URL) completed. Query: "${searchQuery}", LoadType: ${searchResult.loadType}`
          )
        } catch (error) {
          searchError = error
          searchAttempts.push({ source: "direct", success: false, error: error.message })
          client.warn(
            `[MusicManager] Direct search (non-URL) failed for query "${query}". Error: ${error.message}`
          )
        }
      } else {
        try {
          searchResult = await player.search(query, requester)
          searchAttempts.push({
            source: "direct-url",
            success: true,
            loadType: searchResult.loadType,
          })
          client.debug(
            `[MusicManager] Direct search (URL) completed. URL: "${query}", LoadType: ${searchResult.loadType}`
          )
        } catch (error) {
          searchError = error
          searchAttempts.push({ source: "direct-url", success: false, error: error.message })
          client.warn(
            `[MusicManager] Direct search (URL) failed for URL "${query}". Error: ${error.message}`
          )
        }
      }

      if (
        !searchResult ||
        searchResult.loadType === "LOAD_FAILED" ||
        searchResult.loadType === "NO_MATCHES"
      ) {
        client.debug(
          `[MusicManager] Direct search failed or no matches for "${query}". Trying Spotify fallback.`
        )
        try {
          searchResult = await player.search(query, requester)
          searchAttempts.push({
            source: "spotify/fallback",
            success: true,
            loadType: searchResult.loadType,
          })
          client.debug(
            `[MusicManager] Spotify/fallback search completed. Query: "${query}", LoadType: ${searchResult.loadType}`
          )
        } catch (error) {
          searchAttempts.push({ source: "spotify/fallback", success: false, error: error.message })
          client.warn(
            `[MusicManager] Spotify/fallback search failed for query "${query}". Error: ${error.message}`
          )
          if (!searchError) searchError = error
        }
      }
    } else {
      client.debug(
        `[MusicManager] Skipping main Lavalink search as searchResult is already populated. LoadType: ${searchResult.loadType}`
      )
    }

    if (
      !searchResult ||
      searchResult.loadType === "LOAD_FAILED" ||
      searchResult.loadType === "NO_MATCHES"
    ) {
      client.warn(
        `[MusicManager] All Lavalink search attempts failed for query "${query}". Attempts: ${JSON.stringify(searchAttempts)}`
      )
      let errorDetails = "Search attempts:\n"
      searchAttempts.forEach((attempt, index) => {
        errorDetails += `${index + 1}. ${attempt.source}: ${attempt.success ? `Success (${attempt.loadType || ""})` : "Failed"}`
        if (!attempt.success && attempt.error) errorDetails += ` (${attempt.error})`
        errorDetails += "\n"
      })
      feedbackText = `${requester}, I couldn't find any playable tracks for "${query}".\n${errorDetails}`
      errorResult = searchError || new Error("All Lavalink search attempts failed")
      return { success: false, feedbackText, error: errorResult }
    }

    client.debug(
      `[MusicManager] Processing Lavalink search result. LoadType: ${searchResult.loadType}`
    )
    switch (searchResult.loadType) {
      case "LOAD_FAILED":
        client.warn(
          `[MusicManager] Lavalink search failed for query "${query}". Error: ${searchResult.exception?.message}`
        )
        feedbackText = `${requester}, I couldn't load results for "${query}".\nError: ${searchResult.exception?.message ?? "Unknown error"}\nSource: ${searchResult.tracks?.[0]?.info?.sourceName ?? "Unknown"}`
        errorResult = new Error(searchResult.exception?.message ?? "LOAD_FAILED")
        success = false
        break
      case "NO_MATCHES":
        client.debug(`[MusicManager] No matches found for query "${query}".`)
        feedbackText = `${requester}, I couldn't find any tracks for "${query}".\nTried sources: ${searchAttempts.map((a) => `${a.source} (${a.success ? "Success" : "Failed"})`).join(", ")}`
        success = false
        break
      case "track":
      case "TRACK_LOADED":
        trackToAdd = searchResult.tracks[0]
        client.debug(
          `[MusicManager] Loaded single track: ${trackToAdd.info.title}. Adding to queue.`
        )
        if (!trackToAdd.track && trackToAdd.info?.uri) trackToAdd.track = trackToAdd.info.uri
        player.queue.add(trackToAdd)
        if (!feedbackText)
          feedbackText = `Added [${trackToAdd.info.title}](${trackToAdd.info.uri}) to the queue.`
        success = true
        break
      case "SEARCH_RESULT":
      case "search":
        trackToAdd = searchResult.tracks[0]
        client.debug(
          `[MusicManager] Found search result: ${trackToAdd.info.title}. Adding first track to queue.`
        )
        if (!trackToAdd.track && trackToAdd.info?.uri) trackToAdd.track = trackToAdd.info.uri
        player.queue.add(trackToAdd)
        if (!feedbackText)
          feedbackText = `Added [${trackToAdd.info.title}](${trackToAdd.info.uri}) to the queue.`
        success = true
        break
      case "PLAYLIST_LOADED":
      case "playlist":
        client.debug(
          `[MusicManager] Loaded playlist: ${searchResult.playlist?.name} (${searchResult.tracks.length} tracks). Adding to queue.`
        )
        player.queue.add(searchResult.tracks)
        trackToAdd = searchResult.tracks[0]
        if (!feedbackText)
          feedbackText = `Added playlist **${searchResult.playlist?.name ?? "Unknown Playlist"}** (${searchResult.tracks.length} songs) to the queue.`
        success = true
        break
      default:
        client.warn(
          `[MusicManager] Unknown search result loadType: ${searchResult.loadType} for query "${query}".`
        )
        if (!feedbackText)
          feedbackText = `${requester}, An unexpected result type (${searchResult.loadType}) occurred.`
        success = false
        break
    }

    if (!success && !errorResult) {
      errorResult = new Error(
        `Failed to process search results with LoadType: ${searchResult.loadType}`
      )
    }

    client.debug(
      `[MusicManager] Search result handling complete. Success: ${success}, Track added: ${!!trackToAdd}. Feedback: "${feedbackText}"`
    )

    if (success && trackToAdd) {
      client.debug(
        `[MusicManager] Lavalink track [${trackToAdd.info.title}] to be played. Ensuring player is connected then starting playback.`
      )
      try {
        if (!player.connected || player.voiceChannelId !== voiceChannel.id) {
          client.debug(
            `[MusicManager] Lavalink player not connected or in wrong channel. Player state: Connected=${player.connected}, Player VC=${player.voiceChannelId}, Target VC=${voiceChannel.id}. Reconnecting/Moving.`
          )
          player.voiceChannelId = voiceChannel.id
          await player.connect(voiceChannel.id)
          client.debug(
            `[MusicManager] Lavalink player connect/move call initiated. Waiting for connection.`
          )
          const startTime = Date.now()
          const timeoutMs = 10000
          while (!player.connected && Date.now() - startTime < timeoutMs) {
            await new Promise((r) => setTimeout(r, 100))
          }
          if (!player.connected) {
            client.warn(
              `[MusicManager] Lavalink player failed to connect (player.connected is false) within ${timeoutMs / 1000}s.`
            )
            throw new Error("Lavalink player failed to confirm connection.")
          }
          client.debug(
            `[MusicManager] Lavalink player connect/move call completed. Player VC ${player.voiceChannelId}, Connected=${player.connected}.`
          )
        } else {
          client.debug(
            `[MusicManager] Lavalink player already connected to correct VC ${voiceChannel.id}.`
          )
        }

        if (!player.playing) {
          if (player.queue.size > 0) {
            await player.play()
            client.debug(
              `[MusicManager] Lavalink player started playing [${player.queue.current?.info?.title || "track from queue"}].`
            )
          } else if (trackToAdd) {
            client.warn(
              `[MusicManager] Player not playing, queue empty, but trackToAdd exists. Fallback direct play for [${trackToAdd.info.title}].`
            )
            await player.play({ track: trackToAdd })
            client.debug(
              `[MusicManager] Lavalink player (fallback) started playing [${trackToAdd.info.title}].`
            )
          } else {
            client.debug(
              `[MusicManager] Player not playing and no specific track to play after connection.`
            )
          }
        } else {
          client.debug(
            `[MusicManager] Player already playing. [${trackToAdd?.info?.title || "New track"}] was added to queue.`
          )
        }
      } catch (playError) {
        client.error(`[MusicManager] Error starting Lavalink player:`, playError)
        const originalFeedback = feedbackText
        if (playError.message?.includes("No supported audio streams available")) {
          feedbackText = `${requester}, I couldn't play [${trackToAdd.info.title}](${trackToAdd.info.uri}) because it has no supported audio streams (age/region lock, private, etc.).`
          if (
            player.queue.tracks.length > 0 &&
            player.queue.current?.info?.uri !== trackToAdd.info.uri
          ) {
            player.skip()
            feedbackText += "\n\nSkipping to next track..."
          }
        } else {
          feedbackText = `${requester}, Failed to start playback for [${trackToAdd.info.title}](${trackToAdd.info.uri}). Error: ${playError.message}`
        }
        if (originalFeedback.startsWith("Added")) {
          feedbackText = `${originalFeedback}\nHowever, ${feedbackText.substring(feedbackText.indexOf(",") + 1).trim()}`
        }
        success = false
        errorResult = playError
      }
    } else if (!success && !errorResult && trackToAdd) {
      client.debug(
        "[MusicManager] Track was processed by switch, but overall success is false. Not attempting to play."
      )
    }

    if (trackToAdd || searchResult?.loadType === "PLAYLIST_LOADED") {
      client.debug(`[MusicManager] Triggering control message update for guild ${guildId}.`)
      await updateControlMessage(client, guildId)
    }

    return { success, feedbackText, error: errorResult }
  } catch (error) {
    client.error(`[MusicManager] Uncaught error in handleQueryAndPlay for guild ${guildId}:`, error)
    const finalFeedback = feedbackText || `${requester}, An unexpected error occurred.`
    return {
      success: false,
      feedbackText: finalFeedback,
      error: error,
    }
  }
}
