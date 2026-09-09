import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { Player, Track } from "lavalink-client"
import {
    enqueueMusicManagerTracksAssumingSearchDone,
    resolveLivePlayerAfterReplacementConnectWaits,
    scheduleSaveIfPlayerStillLive,
} from "./musicManagerEnqueue.js"

function mockTrack(id: string): Track {
    return {
        encoded: `enc-${id}`,
        info: {
            title: id,
            author: "Artist",
            uri: `https://example.com/${id}`,
            duration: 1000,
            isStream: false,
            identifier: id,
            isSeekable: true,
            sourceName: "http",
            artworkUrl: null,
            isrc: null,
        },
        requester: undefined,
    } as unknown as Track
}

function mockMutablePlayer(guildId: string, initial: Track[] = [], playing = true): Player {
    const tracks = [...initial]
    return {
        guildId,
        playing,
        queue: {
            current: playing ? mockTrack("current") : null,
            tracks,
            add(items: Track | Track[]) {
                const list = Array.isArray(items) ? items : [items]
                tracks.push(...list)
                return Promise.resolve()
            },
            async splice(start: number, deleteCount: number, ...insert: Track[]) {
                return tracks.splice(start, deleteCount, ...insert.flat())
            },
        },
        get() {
            return undefined
        },
        async play() {
            return undefined
        },
    } as unknown as Player
}

describe("enqueueMusicManagerTracksAssumingSearchDone", () => {
    it("adds to the live player resolved under the lock, not a stale destroyed reference", async () => {
        const guildId = "guild-mm-enqueue-stale"
        const staleDestroyed = mockMutablePlayer(guildId, [mockTrack("old")])
        const live = mockMutablePlayer(guildId, [mockTrack("kept")])

        const outcome = await enqueueMusicManagerTracksAssumingSearchDone(
            () => live,
            guildId,
            { isPlaylist: false, tracks: [mockTrack("discord-add")] },
            "user-1"
        )

        assert.equal(outcome.status, "ok")
        if (outcome.status !== "ok") return
        assert.equal(live.queue.tracks.map((t) => t.info.title).join(","), "kept,discord-add")
        assert.equal(staleDestroyed.queue.tracks.length, 1)
        assert.equal(staleDestroyed.queue.tracks[0]?.info.title, "old")
    })

    it("returns no_player when /stop destroyed the player during search", async () => {
        const outcome = await enqueueMusicManagerTracksAssumingSearchDone(
            () => undefined,
            "guild-mm-enqueue-gone",
            { isPlaylist: false, tracks: [mockTrack("lost")] },
            "user-1"
        )
        assert.equal(outcome.status, "no_player")
    })

    it("enqueues playlist tracks onto the live player only", async () => {
        const guildId = "guild-mm-enqueue-playlist"
        const staleDestroyed = mockMutablePlayer(guildId, [mockTrack("old")])
        const live = mockMutablePlayer(guildId, [])

        const outcome = await enqueueMusicManagerTracksAssumingSearchDone(
            () => live,
            guildId,
            {
                isPlaylist: true,
                tracks: [mockTrack("p1"), mockTrack("p2")],
                playlistName: "Mix",
            },
            "user-1"
        )

        assert.equal(outcome.status, "ok")
        if (outcome.status !== "ok") return
        assert.match(outcome.feedbackText, /Mix/)
        assert.equal(live.queue.tracks.map((t) => t.info.title).join(","), "p1,p2")
        assert.equal(staleDestroyed.queue.tracks.length, 1)
    })

    it("returns no_player when expectedPlayer differs from the live successor", async () => {
        const guildId = "guild-mm-enqueue-successor"
        const resolvePlayer = mockMutablePlayer(guildId, [mockTrack("old")])
        const successor = mockMutablePlayer(guildId, [mockTrack("kept")])

        const outcome = await enqueueMusicManagerTracksAssumingSearchDone(
            () => successor,
            guildId,
            { isPlaylist: false, tracks: [mockTrack("pollution")] },
            "user-1",
            resolvePlayer
        )

        assert.equal(outcome.status, "no_player")
        assert.equal(successor.queue.tracks.map((t) => t.info.title).join(","), "kept")
        assert.equal(resolvePlayer.queue.tracks.map((t) => t.info.title).join(","), "old")
    })

    it("scheduleSaveIfPlayerStillLive ignores a destroyed zombie reference", async () => {
        const guildId = "guild-mm-save-zombie"
        const zombie = mockMutablePlayer(guildId, [mockTrack("stopped-queue")])
        let live: Player | undefined

        scheduleSaveIfPlayerStillLive(() => live, zombie)
        // No throw; live is undefined so save must be skipped (zombie must not resurrect).
        assert.equal(live, undefined)

        live = mockMutablePlayer(guildId, [mockTrack("kept")])
        scheduleSaveIfPlayerStillLive(() => live, live)
        scheduleSaveIfPlayerStillLive(() => live, zombie)
    })
})

describe("resolveLivePlayerAfterReplacementConnectWaits", () => {
    it("skips reconnect when the player identity did not change during the first wait", async () => {
        const guildId = "guild-mm-replace-same"
        const player = mockMutablePlayer(guildId)
        const ensureCalls: Player[] = []

        const live = await resolveLivePlayerAfterReplacementConnectWaits(
            player,
            player,
            () => player,
            async (p) => {
                ensureCalls.push(p)
            }
        )

        assert.equal(live, player)
        assert.equal(ensureCalls.length, 0)
    })

    it("reconnects once after a replacement and returns the re-resolved player", async () => {
        const guildId = "guild-mm-replace-once"
        const before = mockMutablePlayer(guildId)
        const after = mockMutablePlayer(guildId)
        const ensureCalls: Player[] = []

        const live = await resolveLivePlayerAfterReplacementConnectWaits(
            before,
            after,
            () => after,
            async (p) => {
                ensureCalls.push(p)
            }
        )

        assert.equal(live, after)
        assert.equal(ensureCalls.length, 1)
        assert.equal(ensureCalls[0], after)
    })

    it("reconnects a second time when identity changes again during the replacement wait", async () => {
        const guildId = "guild-mm-replace-twice"
        const before = mockMutablePlayer(guildId)
        const afterFirst = mockMutablePlayer(guildId)
        const afterSecond = mockMutablePlayer(guildId)
        let liveRef: Player | undefined = afterFirst
        const ensureCalls: Player[] = []

        const live = await resolveLivePlayerAfterReplacementConnectWaits(
            before,
            afterFirst,
            () => liveRef,
            async (p) => {
                ensureCalls.push(p)
                // /stop wins during the first replacement connect → successor #2.
                if (p === afterFirst) liveRef = afterSecond
            }
        )

        assert.equal(live, afterSecond)
        assert.equal(ensureCalls.length, 2)
        assert.equal(ensureCalls[0], afterFirst)
        assert.equal(ensureCalls[1], afterSecond)
    })

    it("returns undefined when /stop destroys the player during the first replacement wait", async () => {
        const guildId = "guild-mm-replace-destroyed-1"
        const before = mockMutablePlayer(guildId)
        const after = mockMutablePlayer(guildId)
        let liveRef: Player | undefined = after

        const live = await resolveLivePlayerAfterReplacementConnectWaits(
            before,
            after,
            () => liveRef,
            async () => {
                liveRef = undefined
            }
        )

        assert.equal(live, undefined)
    })

    it("returns undefined when /stop destroys the player during the second replacement wait", async () => {
        const guildId = "guild-mm-replace-destroyed-2"
        const before = mockMutablePlayer(guildId)
        const afterFirst = mockMutablePlayer(guildId)
        const afterSecond = mockMutablePlayer(guildId)
        let liveRef: Player | undefined = afterFirst

        const live = await resolveLivePlayerAfterReplacementConnectWaits(
            before,
            afterFirst,
            () => liveRef,
            async (p) => {
                if (p === afterFirst) liveRef = afterSecond
                else liveRef = undefined
            }
        )

        assert.equal(live, undefined)
    })
})
