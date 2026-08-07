import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { endCurrentTrackForAutoplay } from "./endCurrentTrackForAutoplay.js"

describe("endCurrentTrackForAutoplay", () => {
    it("calls stopPlaying(false, true) so autoplay can run without skip's internal_skipped", async () => {
        const calls: [boolean | undefined, boolean | undefined][] = []
        await endCurrentTrackForAutoplay({
            stopPlaying: async (clearQueue, executeAutoplay) => {
                calls.push([clearQueue, executeAutoplay])
            },
        })
        assert.deepEqual(calls, [[false, true]])
    })

    it("propagates stopPlaying failures to the caller", async () => {
        await assert.rejects(
            () =>
                endCurrentTrackForAutoplay({
                    stopPlaying: async () => {
                        throw new Error("node down")
                    },
                }),
            /node down/
        )
    })
})
