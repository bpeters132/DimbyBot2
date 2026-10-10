import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { LIVE_PLAYER_RACE_HTTP_STATUS } from "../../src/botApi/livePlayerRaceHttp.js"
import {
    QUEUE_CLEAR_STALE_API_DETAILS,
    QUEUE_CLEAR_STALE_API_ERROR,
    mapQueueClearStale,
} from "../../src/botApi/queueClearRaceHttp.js"

describe("mapQueueClearStale", () => {
    it("maps a live successor to 409 player_replaced, not 200 success", () => {
        const mapped = mapQueueClearStale({ guildId: "g1" })
        assert.equal(mapped.kind, "replaced")
        if (mapped.kind !== "replaced") return
        assert.equal(mapped.status, LIVE_PLAYER_RACE_HTTP_STATUS)
        assert.equal(mapped.status, 409)
        assert.deepEqual(mapped.error, {
            error: QUEUE_CLEAR_STALE_API_ERROR,
            details: QUEUE_CLEAR_STALE_API_DETAILS,
        })
        assert.notEqual(mapped.status, 200)
        assert.notEqual(mapped.status, 404)
    })

    it("maps a destroyed slot to destroyed, not 409, so the handler can return 200 empty", () => {
        for (const live of [undefined, null]) {
            const mapped = mapQueueClearStale(live)
            assert.equal(mapped.kind, "destroyed")
            assert.equal("status" in mapped, false)
        }
    })

    it("does not collapse successor replace into the destroyed empty-queue outcome", () => {
        const replaced = mapQueueClearStale({ guildId: "g1" })
        const destroyed = mapQueueClearStale(undefined)
        assert.equal(replaced.kind, "replaced")
        assert.equal(destroyed.kind, "destroyed")
        assert.notEqual(replaced.kind, destroyed.kind)
    })
})
