import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { mapQueueIndexLockFailure } from "../../src/botApi/queueIndexLockFailure.js"

describe("mapQueueIndexLockFailure", () => {
    it("maps a missing live player to 404, not 409 player-replaced", () => {
        const mapped = mapQueueIndexLockFailure("no_player")
        assert.deepEqual(mapped, {
            status: 404,
            error: "No active player for this guild.",
        })
        assert.notEqual(mapped.status, 409)
        assert.notEqual(mapped.status, 400)
        assert.notEqual(mapped.error, "Queue index out of range.")
    })

    it("maps an out-of-range index to 404, not 400 parse failure", () => {
        const mapped = mapQueueIndexLockFailure("out_of_range")
        assert.deepEqual(mapped, {
            status: 404,
            error: "Queue index out of range.",
        })
        assert.notEqual(mapped.status, 400)
        assert.notEqual(mapped.status, 409)
        assert.notEqual(mapped.error, "No active player for this guild.")
    })
})
