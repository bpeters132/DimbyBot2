import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { skipCurrentTrack } from "./skipCurrentTrack.js"

describe("skipCurrentTrack", () => {
    it("uses default skip when upcoming tracks exist", async () => {
        const calls: Array<{ skipTo?: number; throwError?: boolean }> = []
        await skipCurrentTrack({
            queue: { tracks: { length: 2 } },
            skip: async (skipTo, throwError) => {
                calls.push({ skipTo, throwError })
            },
        })
        assert.deepEqual(calls, [{ skipTo: undefined, throwError: undefined }])
    })

    it("uses skip(0, false) when only the current track remains", async () => {
        const calls: Array<{ skipTo?: number; throwError?: boolean }> = []
        await skipCurrentTrack({
            queue: { tracks: { length: 0 } },
            skip: async (skipTo, throwError) => {
                calls.push({ skipTo, throwError })
            },
        })
        assert.deepEqual(calls, [{ skipTo: 0, throwError: false }])
    })
})
