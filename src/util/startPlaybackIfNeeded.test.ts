import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { Player, Track } from "lavalink-client"
import { playbackStartLostLivePlayer, startPlaybackIfNeeded } from "./startPlaybackIfNeeded.js"

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

type MockPlayer = Player & {
    playing: boolean
    queue: { current: Track | null; tracks: Track[] }
    playCalls: number
}

function mockPlayer(opts: {
    playing?: boolean
    current?: Track | null
    tracks?: Track[]
    playDelayMs?: number
    onPlay?: () => void
}): MockPlayer {
    const delayMs = opts.playDelayMs ?? 0
    const player = {
        guildId: "guild-start-playback",
        playing: opts.playing ?? false,
        queue: {
            current: opts.current === undefined ? null : opts.current,
            tracks: opts.tracks ? [...opts.tracks] : [],
        },
        playCalls: 0,
        async play() {
            player.playCalls += 1
            opts.onPlay?.()
            if (delayMs > 0) {
                await new Promise<void>((resolve) => setTimeout(resolve, delayMs))
            }
            player.playing = true
        },
    }
    return player as unknown as MockPlayer
}

describe("startPlaybackIfNeeded", () => {
    it("does not call play when already playing", async () => {
        const player = mockPlayer({
            playing: true,
            current: mockTrack("cur"),
        })
        await startPlaybackIfNeeded(player, () => player)
        assert.equal(player.playCalls, 0)
    })

    it("does not call play when the queue is empty", async () => {
        const player = mockPlayer({ playing: false, current: null, tracks: [] })
        await startPlaybackIfNeeded(player, () => player)
        assert.equal(player.playCalls, 0)
    })

    it("starts playback when idle with a current track", async () => {
        const player = mockPlayer({
            playing: false,
            current: mockTrack("cur"),
        })
        await startPlaybackIfNeeded(player, () => player)
        assert.equal(player.playCalls, 1)
        assert.equal(player.playing, true)
    })

    it("starts playback when idle with upcoming tracks only", async () => {
        const player = mockPlayer({
            playing: false,
            current: null,
            tracks: [mockTrack("next")],
        })
        await startPlaybackIfNeeded(player, () => player)
        assert.equal(player.playCalls, 1)
    })

    it("serializes concurrent starts so play runs once while already starting", async () => {
        const player = mockPlayer({
            playing: false,
            current: mockTrack("cur"),
            playDelayMs: 40,
        })
        await Promise.all([
            startPlaybackIfNeeded(player, () => player),
            startPlaybackIfNeeded(player, () => player),
        ])
        assert.equal(player.playCalls, 1)
    })

    it("re-checks after waiting when the first start left the player idle with a queue", async () => {
        let playInvocations = 0
        const player = mockPlayer({
            playing: false,
            current: mockTrack("cur"),
        })

        // First play leaves the player idle (failed/aborted start) while tracks remain queued.
        player.play = async () => {
            player.playCalls += 1
            playInvocations += 1
            await new Promise<void>((resolve) => setTimeout(resolve, 30))
            player.playing = playInvocations > 1
        }

        await Promise.all([
            startPlaybackIfNeeded(player, () => player),
            startPlaybackIfNeeded(player, () => player),
        ])
        assert.equal(player.playCalls, 2)
        assert.equal(player.playing, true)
    })

    it("returns no_player and does not call play when getLivePlayer is already a successor", async () => {
        const player = mockPlayer({
            playing: false,
            current: mockTrack("cur"),
        })
        const successor = mockPlayer({
            playing: false,
            current: mockTrack("other"),
        })
        const result = await startPlaybackIfNeeded(player, () => successor)
        assert.equal(result, "no_player")
        assert.equal(player.playCalls, 0)
        assert.equal(successor.playCalls, 0)
    })

    it("returns no_player and does not call play when replaced during prepare", async () => {
        const player = mockPlayer({
            playing: false,
            current: mockTrack("cur"),
        })
        const successor = mockPlayer({
            playing: false,
            current: mockTrack("other"),
        })
        // Native-ready path returns ok without awaiting companion; flip after a tick by
        // delaying play readiness via a getter that switches mid-flight is covered by
        // the prepare-await path below using a thenable getLivePlayer sequence.
        let calls = 0
        const result = await startPlaybackIfNeeded(player, () => {
            calls += 1
            // First identity check + ensureCurrentPlayable snapshot see original;
            // after prepare returns, the post-prepare gate must see the successor.
            if (calls >= 3) return successor
            return player
        })
        // For native-ready tracks, ensureCurrentPlayable returns immediately after 1-2
        // getLivePlayer reads; force the post-prepare gate to observe a successor.
        assert.equal(result, "no_player")
        assert.equal(player.playCalls, 0)
        assert.equal(successor.playCalls, 0)
    })
})

describe("playbackStartLostLivePlayer", () => {
    it("is true only for no_player so Discord/API do not report a zombie enqueue as success", () => {
        assert.equal(playbackStartLostLivePlayer("no_player"), true)
        assert.equal(playbackStartLostLivePlayer("ok"), false)
        assert.equal(playbackStartLostLivePlayer("deferred"), false)
        assert.equal(playbackStartLostLivePlayer("empty"), false)
    })
})
