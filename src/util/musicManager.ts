import { updateControlMessage } from "../events/handlers/handleControlChannel.js"
import path from "path"
import fs from "fs"
import { playLocalFile, getLocalPlayerState, stopLocalPlayer } from "./localPlayer.js"
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  type TextBasedChannel,
  type TextChannel,
  type User,
  type VoiceBasedChannel,
} from "discord.js"
import type { Player, PlayerJson, Track, UnresolvedTrack } from "lavalink-client"
import type BotClient from "../lib/BotClient.js"
import type { LocalFile, QueryPlayResult } from "../types/index.js"

type SearchAttempt =
  | { source: string; success: true; loadType?: string }
  | { source: string; success: false; error?: string }

type PlayerSearchResult = Awaited<ReturnType<Player["search"]>>

function syntheticTrackResult(track: Track | UnresolvedTrack): PlayerSearchResult {
  return {
    loadType: "TRACK_LOADED",
    tracks: [track],
    playlist: null,
    exception: null,
  } as unknown as PlayerSearchResult
}

async function ensurePlayerConnected(
  client: BotClient,
  player: Player,
  voiceChannel: VoiceBasedChannel
): Promise<void> {
    if (!player.connected || player.voiceChannelId !== voiceChannel.id) {
        client.debug(
            `[MusicManager] Lavalink player not connected or in wrong channel. Player state: Connected=${player.connected}, Player VC=${player.voiceChannelId}, Target VC=${voiceChannel.id}. Reconnecting/Moving.`
        )
        const timeoutMs = 10000
        const movePromise = new Promise<void>((resolve, reject) => {
            let timeoutId: ReturnType<typeof setTimeout> | null = null
            const cleanup = () => {
                if (timeoutId) clearTimeout(timeoutId)
                client.lavalink.off("playerMove", onPlayerMove)
                client.lavalink.off("playerUpdate", onPlayerUpdate)
            }
            const onPlayerMove = (
              movedPlayer: Player,
              oldChannelId: string | null,
              newChannelId: string | null
            ) => {
                if (movedPlayer.guildId === player.guildId && newChannelId === voiceChannel.id) {
                    cleanup()
                    resolve()
                }
            }
            const onPlayerUpdate = (oldPlayerJson: PlayerJson, updatedPlayer: Player) => {
                if (
                    updatedPlayer.guildId === player.guildId &&
                    updatedPlayer.connected &&
                    updatedPlayer.voiceChannelId === voiceChannel.id
                ) {
                    cleanup()
                    resolve()
                }
            }
            timeoutId = setTimeout(() => {
                cleanup()
                reject(new Error("Lavalink player failed to confirm connection."))
            }, timeoutMs)
            client.lavalink.on("playerMove", onPlayerMove)
            client.lavalink.on("playerUpdate", onPlayerUpdate)
        })

        await player.connect()
        client.debug(
            `[MusicManager] Lavalink player connect/move call initiated. Waiting for connection.`
        )
        try {
            await movePromise
        } catch (error) {
            client.warn(
                `[MusicManager] Lavalink player failed to confirm connection within ${timeoutMs / 1000}s.`
            )
            throw error
        }
        client.debug(
            `[MusicManager] Lavalink player connect/move call completed. Player VC ${player.voiceChannelId}, Connected=${player.connected}.`
        )
    } else {
        client.debug(
            `[MusicManager] Lavalink player already connected to correct VC ${voiceChannel.id}.`
        )
    }
}

export async function handleQueryAndPlay(
  client: BotClient,
  guildId: string,
  voiceChannel: VoiceBasedChannel,
  textChannel: TextBasedChannel,
  query: string,
  requester: User,
  player: Player
): Promise<QueryPlayResult> {
    client.debug(`[MusicManager] handleQueryAndPlay called for guild ${guildId}. Query: "${query}"`)
    const queueSize = player?.queue?.tracks?.length ?? 0
    client.debug(
        `[MusicManager] Player state in handleQueryAndPlay: connected=${player?.connected ?? "unknown"}, playing=${player?.playing ?? "unknown"}, position=${player?.position ?? "unknown"}`
    )
    client.debug(`[MusicManager] Player queue in handleQueryAndPlay: size=${queueSize}`)
    let feedbackText = ""
    let success: boolean | undefined
    let trackToAdd: Track | UnresolvedTrack | null = null
    let errorResult: Error | null = null
    let searchResult: PlayerSearchResult | null = null
    let searchError: Error | null = null
    let searchAttempts: SearchAttempt[] = []
    let skipLocalMatch = false

    try {
        if (
            player.voiceChannelId &&
            player.voiceChannelId !== voiceChannel.id &&
            player.connected
        ) {
            client.warn(
                `[MusicManager] Player is in VC ${player.voiceChannelId}, but user ${requester.id} is in VC ${voiceChannel.id} for guild ${guildId}. Attempting to move player.`
            )
        }

        const isUrl = query.startsWith("http://") || query.startsWith("https://")
        let potentialUrlTrackInfo: Track | UnresolvedTrack | null = null
        let stringForLocalSearch = query
        let localMatchSourceIsUrlTitle = false

        if (isUrl) {
            try {
                client.debug(
                    `[MusicManager] Query is a URL. Probing Lavalink for title: "${query}"`
                )
                const probeResult = await player.search(query, requester)
                const plt = probeResult?.loadType as string | undefined
                if (
                    probeResult &&
                    (plt === "track" || plt === "TRACK_LOADED") &&
                    probeResult.tracks.length > 0
                ) {
                    potentialUrlTrackInfo = probeResult.tracks[0]
                    stringForLocalSearch = potentialUrlTrackInfo.info.title ?? ""
                    localMatchSourceIsUrlTitle = true
                    client.debug(
                        `[MusicManager] URL Probe Success. Using title for local search: "${stringForLocalSearch}"`
                    )
                } else if (probeResult && (plt === "PLAYLIST_LOADED" || plt === "playlist")) {
                    client.debug(
                        `[MusicManager] URL probe returned playlist. Skipping local match and queueing playlist.`
                    )
                    searchResult = probeResult
                    skipLocalMatch = true
                } else {
                    client.debug(
                        `[MusicManager] URL Probe did not yield a usable track title. LoadType: ${probeResult?.loadType}. Will use original URL for Lavalink search if no direct local match.`
                    )
                    stringForLocalSearch = query
                }
            } catch (urlProbeError: unknown) {
                const um = urlProbeError instanceof Error ? urlProbeError.message : String(urlProbeError)
                client.warn(
                    `[MusicManager] Error probing URL "${query}" for title: ${um}. Will use original URL.`
                )
                stringForLocalSearch = query
            }
        } else {
            client.debug(
                `[MusicManager] Query is not a URL. Using original query for local search: "${stringForLocalSearch}"`
            )
            try {
                const searchQuery = query.trim().replace(/\s+/g, " ")
                const preSearchResult = await player.search(searchQuery, requester)
                searchAttempts.push({
                    source: "presearch",
                    success: true,
                    loadType: preSearchResult?.loadType,
                })
                const preLt = preSearchResult?.loadType as string | undefined
                if (preSearchResult && (preLt === "PLAYLIST_LOADED" || preLt === "playlist")) {
                    client.debug(
                        `[MusicManager] Pre-search returned playlist. Skipping local match and queueing playlist.`
                    )
                    searchResult = preSearchResult
                    skipLocalMatch = true
                } else {
                    searchResult = preSearchResult
                }
            } catch (error: unknown) {
                const em = error instanceof Error ? error.message : String(error)
                searchAttempts.push({ source: "presearch", success: false, error: em })
                client.debug(
                    `[MusicManager] Pre-search failed for query "${query}". Proceeding to local match. Error: ${em}`
                )
            }
        }

        const downloadsDir = path.join(process.cwd(), "downloads")
        let matchingFile: LocalFile | null = null

        if (!skipLocalMatch) {
            let metadata: Record<string, { guildId?: string }> = {}
            let downloadsAccessible = true
            try {
                await fs.promises.access(downloadsDir)
            } catch {
                downloadsAccessible = false
            }

            if (downloadsAccessible) {
                const metadataPath = path.join(downloadsDir, ".metadata.json")
                try {
                    const metadataContents = await fs.promises.readFile(metadataPath, "utf8")
                    metadata = JSON.parse(metadataContents)
                } catch (error: unknown) {
                    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
                        client.error(`[MusicManager] Error reading downloads metadata:`, error)
                    }
                }

                let files: LocalFile[] = []
                try {
                    const entries = await fs.promises.readdir(downloadsDir)
                    files = entries
                        .filter((file) => file.endsWith(".wav"))
                        .filter((file) => metadata[file]?.guildId === guildId)
                        .map((f) => ({
                            name: f,
                            path: path.join(downloadsDir, f),
                            title: f.replace(/\.wav$/, "").toLowerCase(),
                        }))
                } catch (error) {
                    client.error(`[MusicManager] Error reading downloads directory:`, error)
                }

                const queryLower = stringForLocalSearch.toLowerCase()
                const queryWords = queryLower.split(/\s+/).filter((word) => word.length > 0)
                if (queryWords.length > 0) {
                    matchingFile =
                      files.find((fileEntry) => {
                        const titleWords = fileEntry.title
                            .split(/\s+/)
                            .filter((word) => word.length > 0)
                        return queryWords.every((qw) =>
                            titleWords.some((tw) => {
                                if (qw.length < 3) return tw === qw
                                return tw.includes(qw) || qw.includes(tw)
                            })
                        )
                    }) ?? null
                }
            }
        }

        if (!skipLocalMatch && matchingFile) {
            client.debug(
                `[MusicManager] Found matching local file: "${matchingFile.title}" for search string "${stringForLocalSearch}" (Source was URL title: ${localMatchSourceIsUrlTitle})`
            )

            let confirmationContent = `${requester}, `
            if (localMatchSourceIsUrlTitle && potentialUrlTrackInfo) {
                confirmationContent += `The URL you provided (for track: **${potentialUrlTrackInfo.info.title.substring(0, 80)}${potentialUrlTrackInfo.info.title.length > 80 ? "..." : ""}**) seems to match a local file: **${matchingFile.title}**.`
            } else {
                confirmationContent += `I found a local file matching your query "${query}": **${matchingFile.title}**.`
            }

            const lavalinkPlayerActive =
              player && (player.playing || player.queue.tracks.length > 0)

            if (lavalinkPlayerActive) {
                confirmationContent += `\n\nChoosing **Play Local File** will **stop the current online music and clear its queue**.`
                confirmationContent += `\nChoosing **Search Online Instead** will ${localMatchSourceIsUrlTitle && potentialUrlTrackInfo ? "play/queue the content from the URL" : `add your query "${query}" to the current online queue`}.`
            } else {
                confirmationContent += `\n\nWould you like to play this local file or ${localMatchSourceIsUrlTitle && potentialUrlTrackInfo ? "play/queue the content from the URL" : `search online for "${query}"`}?`
            }

            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId("play_local_confirmed")
                    .setLabel(
                        `Play Local: ${matchingFile.title.substring(0, 60)}${matchingFile.title.length > 60 ? "..." : ""}`
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

            const confirmationMessage = await (textChannel as TextChannel).send({
                content: confirmationContent,
                components: [row],
            })

            try {
                const buttonInteraction = await confirmationMessage.awaitMessageComponent({
                    filter: (i) =>
                        i.user.id === requester.id &&
                        (i.customId === "play_local_confirmed" ||
                            i.customId === "search_online_instead"),
                    componentType: ComponentType.Button,
                    time: 30000,
                })

                await buttonInteraction.deferUpdate()
                await confirmationMessage
                    .delete()
                    .catch((e) =>
                        client.warn(
                            `[MusicManager] Failed to delete confirmation message: ${e.message}`
                        )
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
                        searchResult = syntheticTrackResult(potentialUrlTrackInfo)
                        client.debug(
                            `[MusicManager] Using pre-fetched track info for URL: ${potentialUrlTrackInfo.info.title}`
                        )
                        feedbackText = `${requester}, Proceeding with content from URL: [${potentialUrlTrackInfo.info.title}](${potentialUrlTrackInfo.info.uri})`
                    } else {
                        feedbackText = `${requester}, Understood. Searching online for "${query}"...`
                    }
                }
            } catch (error: unknown) {
                const em = error instanceof Error ? error.message : String(error)
                client.debug(
                    `[MusicManager] No response for local file confirmation. Defaulting to online search/URL. Error: ${em}`
                )
                await confirmationMessage
                    .delete()
                    .catch((e) =>
                        client.warn(
                            `[MusicManager] Failed to delete confirmation message on timeout: ${e.message}`
                        )
                    )
                if (localMatchSourceIsUrlTitle && potentialUrlTrackInfo) {
                    searchResult = syntheticTrackResult(potentialUrlTrackInfo)
                    feedbackText = `${requester}, No selection made. Proceeding with content from URL: [${potentialUrlTrackInfo.info.title}](${potentialUrlTrackInfo.info.uri})`
                    client.debug(
                        `[MusicManager] Timeout. Using pre-fetched track info for URL: ${potentialUrlTrackInfo.info.title}`
                    )
                } else {
                    feedbackText = `${requester}, No selection made. Proceeding to search online for "${query}".`
                }
            }
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
            const preSearchAttempts = [...searchAttempts]
            const mainSearchAttempts: SearchAttempt[] = []
            searchError = null

            if (!isUrl) {
                try {
                    const searchQuery = query.trim().replace(/\s+/g, " ")
                    searchResult = await player.search(searchQuery, requester)
                    mainSearchAttempts.push({
                        source: "direct",
                        success: true,
                        loadType: searchResult.loadType,
                    })
                    client.debug(
                        `[MusicManager] Direct search (non-URL) completed. Query: "${searchQuery}", LoadType: ${searchResult.loadType}`
                    )
                } catch (error: unknown) {
                    searchError = error instanceof Error ? error : new Error(String(error))
                    const em = searchError.message
                    mainSearchAttempts.push({
                        source: "direct",
                        success: false,
                        error: em,
                    })
                    client.warn(`[MusicManager] Direct search (non-URL) failed for query "${query}". Error: ${em}`)
                }
            } else {
                try {
                    searchResult = await player.search(query, requester)
                    mainSearchAttempts.push({
                        source: "direct-url",
                        success: true,
                        loadType: searchResult.loadType,
                    })
                    client.debug(
                        `[MusicManager] Direct search (URL) completed. URL: "${query}", LoadType: ${searchResult.loadType}`
                    )
                } catch (error: unknown) {
                    searchError = error instanceof Error ? error : new Error(String(error))
                    const em = searchError.message
                    mainSearchAttempts.push({
                        source: "direct-url",
                        success: false,
                        error: em,
                    })
                    client.warn(`[MusicManager] Direct search (URL) failed for URL "${query}". Error: ${em}`)
                }
            }
            searchAttempts = [...preSearchAttempts, ...mainSearchAttempts]
        } else {
            client.debug(
                `[MusicManager] Skipping main Lavalink search as searchResult is already populated. LoadType: ${searchResult.loadType}`
            )
        }

        const loadT = searchResult?.loadType as string | undefined
        if (!searchResult || loadT === "LOAD_FAILED" || loadT === "NO_MATCHES") {
            client.warn(
                `[MusicManager] All Lavalink search attempts failed for query "${query}". Attempts: ${JSON.stringify(searchAttempts)}`
            )
            let errorDetails = "Search attempts:\n"
            searchAttempts.forEach((attempt, index) => {
                errorDetails += `${index + 1}. ${attempt.source}: ${attempt.success ? `Success (${attempt.loadType || ""})` : "Failed"}`
                if (!attempt.success && "error" in attempt && attempt.error)
                  errorDetails += ` (${attempt.error})`
                errorDetails += "\n"
            })
            feedbackText = `${requester}, I couldn't find any playable tracks for "${query}".\n${errorDetails}`
            errorResult = searchError || new Error("All Lavalink search attempts failed")
            return { success: false, feedbackText, error: errorResult }
        }

        client.debug(`[MusicManager] Processing Lavalink search result. LoadType: ${loadT}`)
        switch (loadT) {
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
            case "TRACK_LOADED": {
                trackToAdd = searchResult.tracks[0]
                client.debug(
                    `[MusicManager] Loaded single track: ${trackToAdd.info.title}. Adding to queue.`
                )
                if (!trackToAdd.encoded && trackToAdd.info?.uri?.trim()) {
                  trackToAdd.encoded = trackToAdd.info.uri.trim() as Track["encoded"]
                }
                player.queue.add(trackToAdd)
                if (!feedbackText)
                    feedbackText = `Added [${trackToAdd.info.title}](${trackToAdd.info.uri}) to the queue.`
                success = true
                break
            }
            case "SEARCH_RESULT":
            case "search": {
                trackToAdd = searchResult.tracks[0]
                client.debug(
                    `[MusicManager] Found search result: ${trackToAdd.info.title}. Adding first track to queue.`
                )
                if (!trackToAdd.encoded && trackToAdd.info?.uri?.trim()) {
                  trackToAdd.encoded = trackToAdd.info.uri.trim() as Track["encoded"]
                }
                player.queue.add(trackToAdd)
                if (!feedbackText)
                    feedbackText = `Added [${trackToAdd.info.title}](${trackToAdd.info.uri}) to the queue.`
                success = true
                break
            }
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
                    `[MusicManager] Unknown search result loadType: ${loadT} for query "${query}".`
                )
                if (!feedbackText)
                    feedbackText = `${requester}, An unexpected result type (${loadT}) occurred.`
                success = false
                break
        }

        if (!success && !errorResult) {
            errorResult = new Error(`Failed to process search results with LoadType: ${loadT}`)
        }

        client.debug(
            `[MusicManager] Search result handling complete. Success: ${success}, Track added: ${!!trackToAdd}. Feedback: "${feedbackText}"`
        )

        if (success && trackToAdd) {
            client.debug(
                `[MusicManager] Lavalink track [${trackToAdd.info.title}] to be played. Ensuring player is connected then starting playback.`
            )
            try {
                await ensurePlayerConnected(client, player, voiceChannel)

                client.debug(
                    `[MusicManager] Before play check: player.playing=${player.playing}, player.queue.tracks.length=${player.queue.tracks.length}`
                )
                if (!player.playing && player.queue.tracks.length > 0) {
                    await player.play()
                    client.debug(
                        `[MusicManager] Lavalink player started playing [${player.queue.current?.info?.title || "track from queue"}].`
                    )
                }
            } catch (playError: unknown) {
                client.error(`[MusicManager] Error starting Lavalink player:`, playError)
                const originalFeedback = feedbackText
                const pem = playError instanceof Error ? playError.message : String(playError)
                if (pem.includes("No supported audio streams available")) {
                    feedbackText = `${requester}, I couldn't play [${trackToAdd.info.title}](${trackToAdd.info.uri}) because it has no supported audio streams (age/region lock, private, etc.).`
                    if (
                        player.queue.tracks.length > 0 &&
                        player.queue.current?.info?.uri !== trackToAdd.info.uri
                    ) {
                        try {
                            await player.skip()
                        } catch (skipError) {
                            client.error(`[MusicManager] Error skipping to next track:`, skipError)
                        }
                        feedbackText += "\n\nSkipping to next track..."
                    }
                } else {
                    feedbackText = `${requester}, Failed to start playback for [${trackToAdd.info.title}](${trackToAdd.info.uri}). Error: ${pem}`
                }
                if (originalFeedback.startsWith("Added")) {
                    feedbackText = `${originalFeedback}\nHowever, ${feedbackText.substring(feedbackText.indexOf(",") + 1).trim()}`
                }
                success = false
                errorResult = playError instanceof Error ? playError : new Error(String(playError))
            }
        } else if (!success && !errorResult && trackToAdd) {
            client.debug(
                "[MusicManager] Track was processed by switch, but overall success is false. Not attempting to play."
            )
        }

        if (
            trackToAdd ||
            loadT === "PLAYLIST_LOADED" ||
            loadT === "playlist"
        ) {
            client.debug(`[MusicManager] Triggering control message update for guild ${guildId}.`)
            try {
                await updateControlMessage(client, guildId)
            } catch (error: unknown) {
                const em = error instanceof Error ? error.message : String(error)
                client.warn(`[MusicManager] Control message update failed for guild ${guildId}: ${em}`)
            }
        }

        return {
            success: Boolean(success),
            feedbackText,
            error: errorResult ?? undefined,
        }
    } catch (error: unknown) {
        client.error(
            `[MusicManager] Uncaught error in handleQueryAndPlay for guild ${guildId}:`,
            error
        )
        const finalFeedback = feedbackText || `${requester}, An unexpected error occurred.`
        return {
            success: false,
            feedbackText: finalFeedback,
            error: error instanceof Error ? error : new Error(String(error)),
        }
    }
}
