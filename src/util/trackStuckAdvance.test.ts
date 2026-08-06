import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { shouldApplicationSkipOnTrackStuck } from "./trackStuckAdvance.js"

describe("shouldApplicationSkipOnTrackStuck", () => {
    it("is false so the app does not double-advance after lavalink-client trackStuck", () => {
        assert.equal(shouldApplicationSkipOnTrackStuck(), false)
    })
})
