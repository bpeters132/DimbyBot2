import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
    shouldAbortLocalPlayForLivePlayerConflict,
    shouldClearSessionAfterFailedHandoffDestroy,
    shouldDestroyLeftoverHandoffPlayer,
} from "./localPlayHandoffLeftover.js"

describe("localPlayHandoffLeftover", () => {
    it("destroys only when live player is the original handoff instance", () => {
        const handoff = { id: "handoff" }
        const successor = { id: "successor" }

        assert.equal(shouldDestroyLeftoverHandoffPlayer(handoff, handoff), true)
        assert.equal(shouldDestroyLeftoverHandoffPlayer(handoff, successor), false)
        assert.equal(shouldDestroyLeftoverHandoffPlayer(handoff, null), false)
        assert.equal(shouldDestroyLeftoverHandoffPlayer(handoff, undefined), false)
    })

    it("clears session after failed destroy only when no successor owns the slot", () => {
        const handoff = { id: "handoff" }
        const successor = { id: "successor" }

        assert.equal(shouldClearSessionAfterFailedHandoffDestroy(handoff, null), true)
        assert.equal(shouldClearSessionAfterFailedHandoffDestroy(handoff, handoff), true)
        assert.equal(shouldClearSessionAfterFailedHandoffDestroy(handoff, successor), false)
    })

    it("aborts local play when a different live player owns the guild", () => {
        const handoff = { id: "handoff" }
        const successor = { id: "successor" }

        // Empty slot — safe to start local (no flush/steal).
        assert.equal(shouldAbortLocalPlayForLivePlayerConflict(handoff, null), false)
        assert.equal(shouldAbortLocalPlayForLivePlayerConflict(null, null), false)
        // Same instance — proceed with handoff destroy.
        assert.equal(shouldAbortLocalPlayForLivePlayerConflict(handoff, handoff), false)
        // Stale confirmation after /stop+/play — must not flush zombie over successor.
        assert.equal(shouldAbortLocalPlayForLivePlayerConflict(handoff, successor), true)
        // Live player with no handoff target — would steal voice without teardown.
        assert.equal(shouldAbortLocalPlayForLivePlayerConflict(null, successor), true)
        assert.equal(shouldAbortLocalPlayForLivePlayerConflict(undefined, successor), true)
    })
})
