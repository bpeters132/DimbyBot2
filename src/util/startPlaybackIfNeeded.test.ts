import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { Player, Track } from "lavalink-client"
import { startPlaybackIfNeeded } from "./startPlaybackIfNeeded.js"

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
        await startPlaybackIfNeeded(player)
        assert.equal(player.playCalls, 0)
    })

    it("does not call play when the queue is empty", async () => {
        const player = mockPlayer({ playing: false, current: null, tracks: [] })
        await startPlaybackIfNeeded(player)
        assert.equal(player.playCalls, 0)
    })

    it("starts playback when idle with a current track", async () => {
        const player = mockPlayer({
            playing: false,
            current: mockTrack("cur"),
        })
        await startPlaybackIfNeeded(player)
        assert.equal(player.playCalls, 1)
        assert.equal(player.playing, true)
    })

    it("starts playback when idle with upcoming tracks only", async () => {
        const player = mockPlayer({
            playing: false,
            current: null,
            tracks: [mockTrack("next")],
        })
        await startPlaybackIfNeeded(player)
        assert.equal(player.playCalls, 1)
    })

    it("serializes concurrent starts so play runs once while already starting", async () => {
        const player = mockPlayer({
            playing: false,
            current: mockTrack("cur"),
            playDelayMs: 40,
        })
        await Promise.all([startPlaybackIfNeeded(player), startPlaybackIfNeeded(player)])
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

        await Promise.all([startPlaybackIfNeeded(player), startPlaybackIfNeeded(player)])
        assert.equal(player.playCalls, 2)
        assert.equal(player.playing, true)
    })
})
