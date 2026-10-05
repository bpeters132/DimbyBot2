import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
    SKIP_DEFERRED_API_DETAILS,
    SKIP_DEFERRED_API_ERROR,
    SKIP_DEFERRED_USER_MESSAGE,
    SKIP_STALE_API_DETAILS,
    SKIP_STALE_API_ERROR,
    playerHttpResultForSkip,
} from "../../src/util/skipDeferredResult.js"

describe("playerHttpResultForSkip", () => {
    it("returns null when skip completed", () => {
        assert.equal(playerHttpResultForSkip("skipped"), null)
    })

    it("returns 409 next_track_not_ready when prepare is deferred", () => {
        const deferred = playerHttpResultForSkip("deferred")
        assert.deepEqual(deferred, {
            status: 409,
            body: {
                ok: false,
                error: {
                    error: SKIP_DEFERRED_API_ERROR,
                    details: SKIP_DEFERRED_API_DETAILS,
                },
            },
        })
        assert.equal(deferred?.status, 409)
        assert.equal(deferred?.body.ok, false)
        assert.equal(deferred?.body.error.error, "next_track_not_ready")
    })

    it("returns 409 player_replaced when the live player was destroyed or replaced", () => {
        const stale = playerHttpResultForSkip("stale")
        assert.deepEqual(stale, {
            status: 409,
            body: {
                ok: false,
                error: {
                    error: SKIP_STALE_API_ERROR,
                    details: SKIP_STALE_API_DETAILS,
                },
            },
        })
        assert.equal(stale?.body.error.error, "player_replaced")
        assert.equal(stale?.status, 409)
    })

    it("does not collapse stale into deferred copy or a successful skip", () => {
        const stale = playerHttpResultForSkip("stale")
        const deferred = playerHttpResultForSkip("deferred")
        assert.notEqual(stale, null)
        assert.notEqual(deferred, null)
        assert.notEqual(stale?.body.error.error, deferred?.body.error.error)
        assert.notEqual(stale?.body.error.error, "next_track_not_ready")
        assert.notEqual(deferred?.body.error.error, "player_replaced")
    })

    it("keeps Discord user copy distinct from the API details string", () => {
        assert.match(SKIP_DEFERRED_USER_MESSAGE, /still preparing/i)
        assert.match(SKIP_DEFERRED_API_DETAILS, /still preparing/i)
        assert.notEqual(SKIP_DEFERRED_USER_MESSAGE, SKIP_DEFERRED_API_DETAILS)
    })
})
