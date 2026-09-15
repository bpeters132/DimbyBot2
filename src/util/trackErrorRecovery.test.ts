import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { resolveTrackErrorRecoveryTarget } from "./trackErrorRecovery.js"

function mockPlayer(opts: { upcoming?: number; autoplay?: boolean }): {
    queue: { tracks: { length: number } }
    get: (key: string) => unknown
} {
    return {
        queue: { tracks: { length: opts.upcoming ?? 0 } },
        get: (key) => (key === "autoplay" ? opts.autoplay === true : undefined),
    }
}

describe("resolveTrackErrorRecoveryTarget", () => {
    it("returns stale when the player was destroyed during companion retry", () => {
        const zombie = mockPlayer({ upcoming: 0, autoplay: true })
        assert.deepEqual(
            resolveTrackErrorRecoveryTarget(() => undefined, zombie),
            { kind: "stale" }
        )
    })

    it("returns stale when a successor replaced the player during companion retry", () => {
        const zombie = mockPlayer({ upcoming: 0, autoplay: true })
        const successor = mockPlayer({ upcoming: 2, autoplay: false })
        assert.deepEqual(
            resolveTrackErrorRecoveryTarget(() => successor, zombie),
            { kind: "stale" }
        )
    })

    it("does not use zombie empty/autoplay state when a successor is live", () => {
        const zombie = mockPlayer({ upcoming: 0, autoplay: true })
        const successor = mockPlayer({ upcoming: 1, autoplay: false })
        // Identity mismatch must win even if zombie would have chosen autoplay.
        assert.equal(resolveTrackErrorRecoveryTarget(() => successor, zombie).kind, "stale")
    })

    it("skips on the live player when upcoming tracks remain", () => {
        const live = mockPlayer({ upcoming: 3, autoplay: true })
        assert.deepEqual(
            resolveTrackErrorRecoveryTarget(() => live, live),
            {
                kind: "skip",
                player: live,
            }
        )
    })

    it("ends for autoplay on the live player when the upcoming queue is empty", () => {
        const live = mockPlayer({ upcoming: 0, autoplay: true })
        assert.deepEqual(
            resolveTrackErrorRecoveryTarget(() => live, live),
            {
                kind: "autoplay",
                player: live,
            }
        )
    })

    it("idles on the live player when autoplay is off and the queue is empty", () => {
        const live = mockPlayer({ upcoming: 0, autoplay: false })
        assert.deepEqual(
            resolveTrackErrorRecoveryTarget(() => live, live),
            {
                kind: "idle",
                player: live,
            }
        )
    })
})
