import { LavalinkManager } from "lavalink-client"
import type {
    Player,
    SearchResult,
    Track,
    UnresolvedSearchResult,
    UnresolvedTrack,
    TrackInfo,
} from "lavalink-client"
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
    matchesCatalogCandidate,
    orderSimilarByArtistVariety,
    orderLavalinkTracksForAutoplay,
} from "../util/autoplayHistory.js"
import { updateControlMessage } from "../events/handlers/handleControlChannel.js"
import { getGuildSettings } from "../util/saveControlChannel.js"
import { isRRQActive, rebalancePlayerQueueRoundRobin } from "../util/rrqDisconnect.js"
import type BotClient from "./BotClient.js"

/** If title starts with artist then a separator (-–—:|), returns the rest; otherwise null (no dynamic RegExp from user data). */
function titleAfterArtistPrefix(titleRaw: string, artistRaw: string): string | null {
    const title = titleRaw.trim().replace(/\s+/g, " ")
    const artist = artistRaw.trim().replace(/\s+/g, " ")
    if (!artist.length || !title.length) return null
    const tl = title.toLowerCase()
    const al = artist.toLowerCase()
    if (!tl.startsWith(al)) return null
    let i = artist.length
    while (i < title.length && title[i] === " ") i++
    if (i >= title.length) return null
    const sep = title[i]
    if (sep === undefined || !"-–—:|".includes(sep)) return null
    i++
    while (i < title.length && title[i] === " ") i++
    const rest = title.slice(i).trim()
    return rest.length > 0 ? rest : null
}

function resolveAutoplaySeed(player: Player, endedTrack: Track | undefined) {
    let artist = endedTrack?.info?.author?.trim()
    let title = endedTrack?.info?.title?.trim()

    if (title && (!artist || /^unknown$/i.test(artist))) {
        const m = title.match(/^(.+?)\s*[-–—:|]\s*(.+)$/)
        if (m) {
            artist = m[1].trim()
            title = m[2].trim()
        }
    }

    if (title && artist && !/^unknown$/i.test(artist)) {
        const afterDup = titleAfterArtistPrefix(title, artist)
        if (afterDup) title = afterDup
    }

    if (!title) {
        const prev = player.queue.previous?.[0]
        artist = prev?.info?.author?.trim() || artist
        title = prev?.info?.title?.trim()
    }

    const stored = player.get("lastTrack") as { title?: string; artist?: string } | undefined
    if (stored && (!title || !artist)) {
        if (!title && stored.title) title = stored.title.trim()
        if (!artist) artist = (stored.artist || "").trim() || "Unknown Artist"
    }

    if (!title) return null
    if (!artist) artist = "Unknown Artist"
    return { artist, title }
}

function isAllowedSearchLoadType(
    searchResult: UnresolvedSearchResult | SearchResult | null | undefined
) {
    const lt = searchResult?.loadType as string | undefined
    return (
        lt === "track" ||
        lt === "TRACK_LOADED" ||
        lt === "SEARCH_RESULT" ||
        lt === "search" ||
        lt === "playlist" ||
        lt === "PLAYLIST_LOADED"
    )
}

async function searchFirstPlayableTrack(
    player: Player,
    query: string,
    requester: unknown,
    client: BotClient,
    endedTrack: Track | undefined,
    seedArtist: string,
    opts?: { searchQueries?: string[]; catalogArtist?: string; catalogTitle?: string }
): Promise<Track | UnresolvedTrack | null> {
    let attempts: string[]
    if (opts?.searchQueries?.length) {
        const seen = new Set<string>()
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
        let res: SearchResult | UnresolvedSearchResult | undefined
        try {
            res = await player.search(q, requester)
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e)
            client.debug(`[LavalinkManager] Autoplay search error "${q}": ${msg}`)
            continue
        }
        const rlt = res.loadType as string
        if (!res || rlt === "LOAD_FAILED" || rlt === "NO_MATCHES") continue
        if (!res.tracks?.length || !isAllowedSearchLoadType(res)) continue

        const ordered = orderLavalinkTracksForAutoplay(
            res.tracks,
            seedArtist,
            endedTrack?.info as TrackInfo | undefined,
            player
        )
        for (const t of ordered) {
            if (!t?.info) continue
            if (!isPlausibleAutoplayMusicTrack(t.info)) continue
            const catA = opts?.catalogArtist
            const catT = opts?.catalogTitle
            if (
                catA != null &&
                catT != null &&
                String(catA).trim() &&
                String(catT).trim() &&
                !matchesCatalogCandidate(
                    t.info,
                    String(catA),
                    String(catT),
                    seedArtist,
                    endedTrack?.info
                )
            ) {
                continue
            }
            if (isDuplicateAutoplayCandidate(t.info, endedTrack?.info as TrackInfo | undefined))
                continue
            if (isAutoplayRecentlyPlayed(player, t.info)) continue
            return t
        }
    }
    return null
}

function shouldStillInjectAutoplayTrack(player: Player) {
    if (!player.get("autoplay")) return false
    if ((player.queue?.tracks?.length ?? 0) > 0) return false
    if (player.queue?.current) return false
    if (player.playing) return false
    return true
}

function sendAutoplayChannelMessage(client: BotClient, player: Player, line: string) {
    const textId = player.textChannelId
    if (textId == null) return
    const channel = client.channels.cache.get(textId)
    const controlChannelId = getGuildSettings()[player.guildId]?.controlChannelId
    if (!channel || !channel.isTextBased() || textId === controlChannelId) return

    const textCh = channel as import("discord.js").TextChannel

    textCh
        .send({ content: line, allowedMentions: { parse: [] } })
        .then((msg) => {
            setTimeout(() => {
                msg.delete().catch((e: unknown) => {
                    client.error(
                        "[LavalinkManager] Failed to delete autoplay message (attempt 1):",
                        e
                    )
                    const errMsg =
                        typeof e === "object" &&
                        e !== null &&
                        "message" in e &&
                        typeof e.message === "string"
                            ? e.message
                            : String(e)
                    const errCode =
                        typeof e === "object" && e !== null && "code" in e
                            ? (e as { code?: string }).code
                            : undefined
                    if (errCode === "EAI_AGAIN" || errMsg.includes("ECONNRESET")) {
                        setTimeout(() => {
                            try {
                                void msg.delete().catch((e2: unknown) => {
                                    client.error(
                                        "[LavalinkManager] Failed to delete autoplay message (attempt 2):",
                                        e2
                                    )
                                })
                            } catch (inner: unknown) {
                                client.error(
                                    "[LavalinkManager] Autoplay message delete retry threw:",
                                    inner
                                )
                            }
                        }, 2000)
                    }
                })
            }, 1000 * 10)
        })
        .catch((e: unknown) =>
            client.error("[LavalinkManager] Failed to send autoplay message:", e)
        )
}

async function tryQueueAndPlayAutoplay(
    client: BotClient,
    player: Player,
    endedTrack: Track | undefined,
    seed: { artist: string; title: string },
    requester: unknown
): Promise<boolean> {
    const effectiveEnded = endedTrack ?? player.queue.previous?.[0]
    const endedInfo = effectiveEnded?.info
    const endedArtist = endedInfo?.author?.trim() || ""
    const endedTitle = endedInfo?.title?.trim() || ""

    const tryOne = async (lavalinkTrack: Track | UnresolvedTrack, label: string) => {
        if (!lavalinkTrack?.info) return false
        if (!isPlausibleAutoplayMusicTrack(lavalinkTrack.info)) return false
        if (
            autoplaySameComposition(
                seed.artist,
                seed.title,
                lavalinkTrack.info.author,
                lavalinkTrack.info.title
            )
        ) {
            return false
        }
        if (
            endedArtist &&
            endedTitle &&
            autoplaySameComposition(
                endedArtist,
                endedTitle,
                lavalinkTrack.info.author,
                lavalinkTrack.info.title
            )
        ) {
            return false
        }
        if (isDuplicateAutoplayCandidate(lavalinkTrack.info, endedInfo as TrackInfo | undefined))
            return false
        if (isAutoplayRecentlyPlayed(player, lavalinkTrack.info)) return false

        if (!shouldStillInjectAutoplayTrack(player)) return false

        player.queue.add(lavalinkTrack)
        if (isRRQActive(player)) {
            await rebalancePlayerQueueRoundRobin(player)
        }
        try {
            await player.play()
        } catch (playErr: unknown) {
            const pmsg = playErr instanceof Error ? playErr.message : String(playErr)
            client.warn(
                `[LavalinkManager] Autoplay failed to start "${lavalinkTrack.info?.title}": ${pmsg}`
            )
            try {
                await player.queue.remove(lavalinkTrack)
            } catch (removeErr: unknown) {
                const rmsg = removeErr instanceof Error ? removeErr.message : String(removeErr)
                client.debug(
                    `[LavalinkManager] Autoplay: queue.remove after play failure failed track=${
                        lavalinkTrack?.info?.identifier ?? lavalinkTrack?.encoded ?? "?"
                    } uri=${lavalinkTrack?.info?.uri ?? "?"}: ${rmsg}`
                )
            }
            return false
        }

        try {
            await updateControlMessage(client, player.guildId)
        } catch (e: unknown) {
            const em = e instanceof Error ? e.message : String(e)
            client.warn(`[LavalinkManager] updateControlMessage after autoplay: ${em}`)
        }

        const displayName = lavalinkTrack.info?.title ?? label
        sendAutoplayChannelMessage(client, player, `🔄 Autoplay: Added **${displayName}** to queue`)
        return true
    }

    const similarRes = await getSimilarTracks(seed.artist, seed.title, 25)
    const similarRaw = similarRes.tracks
    const catalogFailure = similarRes.failure
    const failureDetail = similarRes.failureDetail

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
        const track = await searchFirstPlayableTrack(
            player,
            q,
            requester,
            client,
            effectiveEnded,
            seed.artist,
            {
                searchQueries: ytForSim,
                catalogArtist: sim.artist,
                catalogTitle: sim.title,
            }
        )
        if (track && (await tryOne(track, q))) return true
    }

    client.warn(
        `[LavalinkManager] Autoplay: ${similar.length} catalog pick(s) from Spotify/MusicBrainz but none could be resolved on YouTube for guild ${player.guildId}. Seed: "${seed.artist}" — "${seed.title}".`
    )
    return false
}

async function runAutoplay(client: BotClient, player: Player, endedTrack: Track | undefined) {
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

export default function createLavalinkManager(client: BotClient): LavalinkManager {
    client.debug("Creating LavalinkManager instance.")
    const clientId = process.env.CLIENT_ID?.trim()
    if (!clientId) {
        const msg = "CLIENT_ID is required for Lavalink (empty id breaks voice/player identity)."
        client.error(`[LavalinkManager] ${msg}`)
        throw new Error(msg)
    }
    const manager = new LavalinkManager({
        nodes,
        sendToShard: (guildId, payload) => client.guilds.cache.get(guildId)?.shard?.send(payload),
        autoSkip: true,
        client: {
            id: clientId,
            username: "DimbyBot",
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
                autoPlayFunction: async (player: Player, endedTrack: Track | undefined) => {
                    try {
                        await runAutoplay(client, player, endedTrack)
                    } catch (e: unknown) {
                        const msg = e instanceof Error ? e.message : String(e)
                        client.error(`[LavalinkManager] Autoplay crashed: ${msg}`, e)
                    }
                },
            },
        },
    } as ConstructorParameters<typeof LavalinkManager>[0])
    client.debug("LavalinkManager instance created successfully.")
    return manager
}
