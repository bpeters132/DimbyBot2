import { LavalinkManager } from "lavalink-client"
import { nodes } from "../../lavaNodesConfig.js"
import {
  getSimilarTracks,
  formatTrackSearchQuery,
  youtubeSearchQueriesForCatalogTrack,
} from "../util/similarSongsService.js"
import {
  autoplaySameComposition,
  isDuplicateAutoplayCandidate,
  isAutoplayRecentlyPlayed,
  isPlausibleAutoplayMusicTrack,
  orderSimilarByArtistVariety,
  orderLavalinkTracksForAutoplay,
} from "../util/autoplayHistory.js"
import { updateControlMessage } from "../events/handlers/handleControlChannel.js"
import { getGuildSettings } from "../util/saveControlChannel.js"

/**
 * @param {import("lavalink-client").Player} player
 * @param {import("lavalink-client").Track | undefined} endedTrack
 * @returns {{ artist: string, title: string } | null}
 */
function resolveAutoplaySeed(player, endedTrack) {
  let artist = endedTrack?.info?.author?.trim()
  let title = endedTrack?.info?.title?.trim()

  if (title && (!artist || /^unknown$/i.test(artist))) {
    const m = title.match(/^(.+?)\s*[-–—:|]\s*(.+)$/)
    if (m) {
      artist = m[1].trim()
      title = m[2].trim()
    }
  }

  // YouTube often puts "Artist - Song" in title while author is already the artist — duplicate hurts Spotify search.
  if (title && artist && !/^unknown$/i.test(artist)) {
    const esc = artist.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const dup = new RegExp(`^\\s*${esc}\\s*[-–—:|]\\s*(.+)$`, "i")
    const m2 = title.match(dup)
    if (m2) title = m2[1].trim()
  }

  if (!title) {
    const prev = player.queue.previous?.[0]
    artist = prev?.info?.author?.trim() || artist
    title = prev?.info?.title?.trim()
  }

  const stored = player.get("lastTrack")
  if ((!title || !artist) && stored?.title) {
    artist = (stored.artist || artist || "").trim() || "Unknown Artist"
    title = stored.title.trim()
  }

  if (!title) return null
  if (!artist) artist = "Unknown Artist"
  return { artist, title }
}

/**
 * @param {import("lavalink-client").UnresolvedSearchResult | import("lavalink-client").SearchResult | null | undefined} searchResult
 * @returns {boolean}
 */
function isAllowedSearchLoadType(searchResult) {
  const lt = searchResult?.loadType
  return (
    lt === "track" ||
    lt === "TRACK_LOADED" ||
    lt === "SEARCH_RESULT" ||
    lt === "search" ||
    lt === "playlist" ||
    lt === "PLAYLIST_LOADED"
  )
}

/**
 * @param {import("lavalink-client").Player} player
 * @param {string} query
 * @param {unknown} requester
 * @param {import('./BotClient.js').default} client
 * @param {import("lavalink-client").Track | undefined} endedTrack
 * @param {string} seedArtist
 * @param {{ searchQueries?: string[] } | undefined} [opts]
 * @returns {Promise<import("lavalink-client").Track | import("lavalink-client").UnresolvedTrack | null>}
 */
async function searchFirstPlayableTrack(
  player,
  query,
  requester,
  client,
  endedTrack,
  seedArtist,
  opts
) {
  let attempts
  if (opts?.searchQueries?.length) {
    const seen = new Set()
    attempts = []
    for (const raw of opts.searchQueries) {
      const q = raw.startsWith("ytsearch:") ? raw : `ytsearch:${raw}`
      if (seen.has(q)) continue
      seen.add(q)
      attempts.push(q)
    }
  } else if (query.startsWith("ytsearch:")) {
    attempts = [query]
  } else {
    attempts = [query, `ytsearch:${query} official audio`, `ytsearch:${query}`]
  }

  for (const q of attempts) {
    let res
    try {
      res = await player.search(q, requester)
    } catch (e) {
      client.debug(`[LavalinkManager] Autoplay search error "${q}": ${e?.message ?? e}`)
      continue
    }
    if (!res || res.loadType === "LOAD_FAILED" || res.loadType === "NO_MATCHES") continue
    if (!res.tracks?.length || !isAllowedSearchLoadType(res)) continue

    const ordered = orderLavalinkTracksForAutoplay(
      res.tracks,
      seedArtist,
      endedTrack?.info,
      player
    )
    for (const t of ordered) {
      if (!t?.info) continue
      if (!isPlausibleAutoplayMusicTrack(t.info)) continue
      if (isDuplicateAutoplayCandidate(t.info, endedTrack?.info)) continue
      if (isAutoplayRecentlyPlayed(player, t.info)) continue
      return t
    }
  }
  return null
}

/**
 * @param {import("lavalink-client").Player} player
 * @returns {boolean}
 */
function shouldStillInjectAutoplayTrack(player) {
  if (!player.get("autoplay")) return false
  if ((player.queue?.tracks?.length ?? 0) > 0) return false
  if (player.queue?.current) return false
  if (player.playing) return false
  return true
}

/**
 * @param {import('./BotClient.js').default} client
 * @param {import("lavalink-client").Player} player
 * @param {string} line
 */
function sendAutoplayChannelMessage(client, player, line) {
  const channel = client.channels.cache.get(player.textChannelId)
  const controlChannelId = getGuildSettings(client)[player.guildId]?.controlChannelId
  if (!channel || player.textChannelId === controlChannelId) return

  channel
    .send({ content: line, allowedMentions: { parse: [] } })
    .then((msg) => {
      setTimeout(() => {
        msg.delete().catch((e) => {
          client.error("[LavalinkManager] Failed to delete autoplay message (attempt 1):", e)
          if (e.code === "EAI_AGAIN" || e.message.includes("ECONNRESET")) {
            setTimeout(() => {
              msg.delete().catch((e2) =>
                client.error("[LavalinkManager] Failed to delete autoplay message (attempt 2):", e2)
              )
            }, 2000)
          }
        })
      }, 1000 * 10)
    })
    .catch((e) => client.error("[LavalinkManager] Failed to send autoplay message:", e))
}

/**
 * @param {import('./BotClient.js').default} client
 * @param {import("lavalink-client").Player} player
 * @param {import("lavalink-client").Track | undefined} endedTrack
 * @param {{ artist: string, title: string }} seed
 * @param {unknown} requester
 * @returns {Promise<boolean>} true if playback was started
 */
async function tryQueueAndPlayAutoplay(client, player, endedTrack, seed, requester) {
  const effectiveEnded = endedTrack ?? player.queue.previous?.[0]
  const endedInfo = effectiveEnded?.info
  const endedArtist = endedInfo?.author?.trim() || ""
  const endedTitle = endedInfo?.title?.trim() || ""

  const tryOne = async (lavalinkTrack, label) => {
    if (!lavalinkTrack?.info) return false
    if (!isPlausibleAutoplayMusicTrack(lavalinkTrack.info)) return false
    if (autoplaySameComposition(seed.artist, seed.title, lavalinkTrack.info.author, lavalinkTrack.info.title)) {
      return false
    }
    if (
      endedArtist &&
      endedTitle &&
      autoplaySameComposition(endedArtist, endedTitle, lavalinkTrack.info.author, lavalinkTrack.info.title)
    ) {
      return false
    }
    if (isDuplicateAutoplayCandidate(lavalinkTrack.info, endedInfo)) return false
    if (isAutoplayRecentlyPlayed(player, lavalinkTrack.info)) return false

    const resolvedUri = lavalinkTrack.info?.uri
    if (
      !lavalinkTrack.track &&
      typeof resolvedUri === "string" &&
      resolvedUri.trim().length > 0
    ) {
      lavalinkTrack.track = resolvedUri.trim()
    }

    if (!shouldStillInjectAutoplayTrack(player)) return false

    player.queue.add(lavalinkTrack)
    try {
      await player.play()
    } catch (playErr) {
      client.warn(
        `[LavalinkManager] Autoplay failed to start "${lavalinkTrack.info?.title}": ${playErr?.message ?? playErr}`
      )
      try {
        await player.queue.remove(lavalinkTrack)
      } catch (removeErr) {
        client.debug(
          `[LavalinkManager] Autoplay: queue.remove after play failure failed track=${
            lavalinkTrack?.info?.identifier ?? lavalinkTrack?.track ?? "?"
          } uri=${lavalinkTrack?.info?.uri ?? "?"}: ${removeErr?.message ?? removeErr}`
        )
      }
      return false
    }

    try {
      await updateControlMessage(client, player.guildId)
    } catch (e) {
      client.warn(`[LavalinkManager] updateControlMessage after autoplay: ${e?.message ?? e}`)
    }

    const displayName = lavalinkTrack.info?.title ?? label
    sendAutoplayChannelMessage(client, player, `🔄 Autoplay: Added **${displayName}** to queue`)
    return true
  }

  const { tracks: similarRaw, failure: catalogFailure, failureDetail } = await getSimilarTracks(
    seed.artist,
    seed.title,
    25
  )

  if (catalogFailure) {
    const detail = failureDetail ? ` ${failureDetail}` : ""
    client.warn(
      `[LavalinkManager] Autoplay: catalog similar-tracks unavailable (${catalogFailure})${detail} — guild ${player.guildId}, seed "${seed.artist}" — "${seed.title}". Tries Spotify (related-artists + top-tracks) then MusicBrainz; no free-form YouTube mix. For 401/403 check Spotify Developer Dashboard; set MUSICBRAINZ_CONTACT per https://musicbrainz.org/doc/MusicBrainz_API`
    )
    return false
  }

  const similar = orderSimilarByArtistVariety(similarRaw, seed.artist).filter((s) => {
    if (autoplaySameComposition(seed.artist, seed.title, s.artist, s.title)) return false
    if (
      endedArtist &&
      endedTitle &&
      autoplaySameComposition(endedArtist, endedTitle, s.artist, s.title)
    ) {
      return false
    }
    return true
  })

  if (!similar.length) {
    client.warn(
      `[LavalinkManager] Autoplay: no catalog tracks left after filtering (same-as-seed) for guild ${player.guildId}. Seed: "${seed.artist}" — "${seed.title}".`
    )
    return false
  }

  for (const sim of similar) {
    const q = formatTrackSearchQuery(sim)
    if (!q) continue
    const ytForSim = youtubeSearchQueriesForCatalogTrack(sim)
    const track = await searchFirstPlayableTrack(player, q, requester, client, effectiveEnded, seed.artist, {
      searchQueries: ytForSim,
    })
    if (track && (await tryOne(track, q))) return true
  }

  client.warn(
    `[LavalinkManager] Autoplay: ${similar.length} catalog pick(s) from Spotify/MusicBrainz but none could be resolved on YouTube for guild ${player.guildId}. Seed: "${seed.artist}" — "${seed.title}".`
  )
  return false
}

/**
 * @param {import('./BotClient.js').default} client
 * @param {import("lavalink-client").Player} player
 * @param {import("lavalink-client").Track | undefined} endedTrack
 */
async function runAutoplay(client, player, endedTrack) {
  if (!player.get("autoplay")) return

  const seed = resolveAutoplaySeed(player, endedTrack)
  if (!seed) {
    client.warn(
      `[LavalinkManager] Autoplay is on but artist/title could not be resolved for guild ${player.guildId}.`
    )
    return
  }

  await tryQueueAndPlayAutoplay(client, player, endedTrack, seed, client.user)
}

/**
 * Creates and configures the Lavalink manager instance for the bot.
 * @param {import('./BotClient.js').default} client The bot client instance.
 * @returns {import('lavalink-client').LavalinkManager} The configured Lavalink manager.
 */
export default function createLavalinkManager(client) {
  client.debug("Creating LavalinkManager instance.") // Debug log
  const manager = new LavalinkManager({
    nodes,
    sendToShard: (guildId, payload) => client.guilds.cache.get(guildId)?.shard?.send(payload),
    autoSkip: true,
    client: {
      id: process.env.CLIENT_ID,
      username: "DimbyBot", // TODO: add this to ENV
    },
    sources: {
      youtube: true,
      spotify: true,
      soundcloud: true,
      local: true,
    },
    defaultSearchPlatform: "local",
    searchOptions: {
      searchEngine: "local",
      fallbackSearchEngine: "youtube",
    },
    playerOptions: {
      onEmptyQueue: {
        autoPlayFunction: async (player, endedTrack) => {
          try {
            await runAutoplay(client, player, endedTrack)
          } catch (e) {
            client.error(`[LavalinkManager] Autoplay crashed: ${e?.message ?? e}`, e)
          }
        },
      },
    },
  })
  client.debug("LavalinkManager instance created successfully.") // Debug log
  return manager
}
