import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { Player, Track } from "lavalink-client"
import { enqueuePlayNextTrackAssumingSearchDone } from "../../src/util/playNextEnqueue.js"
import { setPlayerSessionPersistenceDbForTests } from "../../src/util/playerSessionPersistence.js"

setPlayerSessionPersistenceDbForTests({
    upsertPlayerSession: async () => undefined,
    deletePlayerSession: async () => undefined,
})

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

function mockMutablePlayer(
    guildId: string,
    initial: Track[] = [],
    opts: { playing?: boolean } = {}
): Player {
    const tracks = [...initial]
    let playing = opts.playing ?? true
    const player = {
        guildId,
        get playing() {
            return playing
        },
        set playing(value: boolean) {
            playing = value
        },
        queue: {
            current: null as Track | null,
            tracks,
            add(items: Track | Track[], index?: number) {
                const list = Array.isArray(items) ? items : [items]
                if (typeof index === "number") {
                    tracks.splice(index, 0, ...list)
                } else {
                    tracks.push(...list)
                }
                return Promise.resolve()
            },
            async splice(start: number, deleteCount: number, ...insert: Track[]) {
                return tracks.splice(start, deleteCount, ...insert.flat())
            },
        },
        async play() {
            if (!player.queue.current && tracks.length > 0) {
                player.queue.current = tracks.shift()!
            }
            playing = true
        },
        get() {
            return undefined
        },
    }
    return player as unknown as Player
}

describe("enqueuePlayNextTrackAssumingSearchDone", () => {
    it("adds to the live player resolved under the lock, not a stale destroyed reference", async () => {
        const guildId = "guild-playnext-stale"
        const staleDestroyed = mockMutablePlayer(guildId, [mockTrack("old")])
        const liveSuccessor = mockMutablePlayer(guildId, [mockTrack("kept")])
        let live: Player | undefined = liveSuccessor

        const track = mockTrack("playnext")
        // Simulate the old bug's capture: callers previously closed over `staleDestroyed`.
        assert.notEqual(staleDestroyed, liveSuccessor)

        const outcome = await enqueuePlayNextTrackAssumingSearchDone(
            () => live,
            guildId,
            track,
            "user-1"
        )

        assert.equal(outcome, "ok")
        assert.equal(liveSuccessor.queue.tracks[0]?.info.title, "playnext")
        assert.equal(liveSuccessor.queue.tracks.length, 2)
        assert.equal(staleDestroyed.queue.tracks.length, 1)
        assert.equal(staleDestroyed.queue.tracks[0]?.info.title, "old")
    })

    it("returns no_player when the guild player was destroyed during search", async () => {
        const guildId = "guild-playnext-gone"
        const track = mockTrack("lost")

        const outcome = await enqueuePlayNextTrackAssumingSearchDone(
            () => undefined,
            guildId,
            track,
            "user-1"
        )

        assert.equal(outcome, "no_player")
    })

    it("returns no_player when a successor replaced the resolve-time player", async () => {
        const guildId = "guild-playnext-successor"
        const resolvePlayer = mockMutablePlayer(guildId, [mockTrack("old")])
        const successor = mockMutablePlayer(guildId, [mockTrack("kept")])
        let calls = 0

        const outcome = await enqueuePlayNextTrackAssumingSearchDone(
            () => {
                calls += 1
                return calls === 1 ? resolvePlayer : successor
            },
            guildId,
            mockTrack("pollution"),
            "user-1"
        )

        assert.equal(outcome, "no_player")
        assert.equal(successor.queue.tracks.map((t) => t.info.title).join(","), "kept")
        assert.equal(resolvePlayer.queue.tracks.map((t) => t.info.title).join(","), "old")
    })

    it("starts playback when the player is idle after queue end", async () => {
        const guildId = "guild-playnext-idle-start"
        const player = mockMutablePlayer(guildId, [], { playing: false })
        let playCalls = 0
        const originalPlay = player.play.bind(player)
        player.play = async () => {
            playCalls += 1
            await originalPlay()
        }

        const outcome = await enqueuePlayNextTrackAssumingSearchDone(
            () => player,
            guildId,
            mockTrack("next-up"),
            "user-1"
        )

        assert.equal(outcome, "ok")
        assert.equal(playCalls, 1)
        assert.equal(player.playing, true)
        assert.equal(player.queue.current?.info.title, "next-up")
        assert.equal(player.queue.tracks.length, 0)
    })

    it("does not call play when the player is already playing", async () => {
        const guildId = "guild-playnext-already-playing"
        const player = mockMutablePlayer(guildId, [mockTrack("soon")], { playing: true })
        player.queue.current = mockTrack("now")
        let playCalls = 0
        player.play = async () => {
            playCalls += 1
        }

        const outcome = await enqueuePlayNextTrackAssumingSearchDone(
            () => player,
            guildId,
            mockTrack("cut-in"),
            "user-1"
        )

        assert.equal(outcome, "ok")
        assert.equal(playCalls, 0)
        assert.equal(player.queue.tracks[0]?.info.title, "cut-in")
        assert.equal(player.queue.current?.info.title, "now")
    })

    it("does not call play when a current track is paused", async () => {
        const guildId = "guild-playnext-paused-current"
        const player = mockMutablePlayer(guildId, [mockTrack("soon")], { playing: false })
        player.queue.current = mockTrack("paused-now")
        let playCalls = 0
        player.play = async () => {
            playCalls += 1
        }

        const outcome = await enqueuePlayNextTrackAssumingSearchDone(
            () => player,
            guildId,
            mockTrack("cut-in"),
            "user-1"
        )

        assert.equal(outcome, "ok")
        assert.equal(playCalls, 0)
        assert.equal(player.playing, false)
        assert.equal(player.queue.current?.info.title, "paused-now")
        assert.equal(player.queue.tracks[0]?.info.title, "cut-in")
        assert.equal(player.queue.tracks[1]?.info.title, "soon")
    })
})
