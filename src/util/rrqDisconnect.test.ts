import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { Player, Track } from "lavalink-client"
import {
    clearDisconnectedUser,
    getDisconnectedUsers,
    hasTrackedDisconnect,
    isDisconnectTimeoutCurrent,
    isRRQActive,
    roundRobinReorderTracks,
    stampRequesterUserIdOnTracks,
    toggleRRQ,
    trackDisconnectedUser,
    userHasQueuedTracks,
} from "./rrqDisconnect.js"

function mockTrack(requester: unknown, title = "t"): Track {
    return {
        encoded: "enc",
        info: {
            title,
            author: "a",
            uri: `https://example.com/${title}`,
            duration: 1000,
            isStream: false,
            identifier: title,
            isSeekable: true,
            sourceName: "http",
            artworkUrl: null,
            isrc: null,
        },
        requester,
    } as unknown as Track
}

function mockPlayer(tracks: Track[] = []): Player {
    const store = new Map<string, unknown>()
    return {
        guildId: "guild-rrq",
        queue: {
            current: null,
            tracks,
        },
        get: (key: string) => store.get(key),
        set: (key: string, value: unknown) => {
            store.set(key, value)
        },
    } as unknown as Player
}

describe("roundRobinReorderTracks", () => {
    it("returns a shallow copy for empty or single-track queues", () => {
        const empty = roundRobinReorderTracks([], "__rrq_none__")
        assert.deepEqual(empty, [])
        assert.notEqual(empty, [])

        const one = [mockTrack("a", "only")]
        const reordered = roundRobinReorderTracks(one, "a")
        assert.equal(reordered.length, 1)
        assert.equal(reordered[0], one[0])
        assert.notEqual(reordered, one)
    })

    it("avoids the previous requester when another user has tracks", () => {
        const a1 = mockTrack("a", "a1")
        const a2 = mockTrack("a", "a2")
        const b1 = mockTrack("b", "b1")
        const ordered = roundRobinReorderTracks([a1, a2, b1], "a")
        assert.equal(ordered[0], b1)
        assert.ok(ordered.slice(1).every((t) => t.requester === "a"))
    })

    it("prefers the heavier remaining requester among valid candidates", () => {
        const a1 = mockTrack("a", "a1")
        const b1 = mockTrack("b", "b1")
        const b2 = mockTrack("b", "b2")
        const b3 = mockTrack("b", "b3")
        const c1 = mockTrack("c", "c1")
        // Previous was c → candidates a (1) and b (3); pick b first.
        const ordered = roundRobinReorderTracks([a1, b1, b2, b3, c1], "c")
        assert.equal(ordered[0]?.requester, "b")
        // Never place the same requester twice in a row while another user still has tracks.
        for (let i = 1; i < ordered.length; i++) {
            const prev = ordered[i - 1]?.requester
            const cur = ordered[i]?.requester
            if (prev === cur) {
                const othersRemain = ordered.slice(i).some((t) => t.requester !== cur)
                assert.equal(
                    othersRemain,
                    false,
                    `unexpected back-to-back ${String(cur)} while others remain`
                )
            }
        }
    })

    it("falls back to same requester when no alternate remains", () => {
        const a1 = mockTrack("a", "a1")
        const a2 = mockTrack("a", "a2")
        const ordered = roundRobinReorderTracks([a1, a2], "a")
        assert.deepEqual(
            ordered.map((t) => t.info.title),
            ["a1", "a2"]
        )
    })

    it("treats missing requesters as a shared unknown bucket", () => {
        const missing = mockTrack(null, "missing")
        const other = mockTrack("u1", "other")
        const ordered = roundRobinReorderTracks([missing, other], "__rrq_none__")
        // Heavier-first among candidates from no previous: both length 1; first key wins reduce.
        assert.equal(ordered.length, 2)
        assert.ok(ordered.includes(missing))
        assert.ok(ordered.includes(other))
        // After placing one, the next should prefer the other bucket over repeating unknown/user.
        assert.notEqual(ordered[0]?.requester ?? null, ordered[1]?.requester ?? null)
    })

    it("reads object-shaped requesters the same as string ids", () => {
        const a = mockTrack({ id: "user-a" }, "a")
        const b = mockTrack({ id: "user-b" }, "b")
        const ordered = roundRobinReorderTracks([a, a, b], "user-a")
        assert.equal(ordered[0], b)
    })
})

describe("stampRequesterUserIdOnTracks", () => {
    it("stamps a stable string requester on each track", () => {
        const tracks = [mockTrack({ id: "old" }, "t1"), mockTrack("other", "t2")]
        stampRequesterUserIdOnTracks(tracks, "discord-user")
        assert.equal(tracks[0]?.requester, "discord-user")
        assert.equal(tracks[1]?.requester, "discord-user")
    })
})

describe("RRQ disconnect tracking", () => {
    it("creates, replaces, and clears disconnect timers without leaving stale handles", () => {
        const player = mockPlayer()
        const first = setTimeout(() => {}, 60_000)
        const second = setTimeout(() => {}, 60_000)
        try {
            trackDisconnectedUser(player, "u1", first)
            assert.equal(hasTrackedDisconnect(player, "u1"), true)
            assert.equal(isDisconnectTimeoutCurrent(player, "u1", first), true)

            trackDisconnectedUser(player, "u1", second)
            assert.equal(isDisconnectTimeoutCurrent(player, "u1", first), false)
            assert.equal(isDisconnectTimeoutCurrent(player, "u1", second), true)

            clearDisconnectedUser(player, "u1")
            assert.equal(hasTrackedDisconnect(player, "u1"), false)
            assert.equal(getDisconnectedUsers(player).size, 0)
        } finally {
            clearTimeout(first)
            clearTimeout(second)
        }
    })

    it("toggleRRQ clears pending disconnect timers when disabling", () => {
        const player = mockPlayer()
        const handle = setTimeout(() => {}, 60_000)
        try {
            assert.equal(isRRQActive(player), false)
            assert.equal(toggleRRQ(player), true)
            assert.equal(isRRQActive(player), true)

            trackDisconnectedUser(player, "u1", handle)
            assert.equal(hasTrackedDisconnect(player, "u1"), true)

            assert.equal(toggleRRQ(player), false)
            assert.equal(isRRQActive(player), false)
            assert.equal(hasTrackedDisconnect(player, "u1"), false)
        } finally {
            clearTimeout(handle)
        }
    })

    it("userHasQueuedTracks inspects upcoming tracks only", () => {
        const player = mockPlayer([mockTrack("u1", "q1"), mockTrack("u2", "q2")])
        assert.equal(userHasQueuedTracks(player, "u1"), true)
        assert.equal(userHasQueuedTracks(player, "u3"), false)
    })
})
