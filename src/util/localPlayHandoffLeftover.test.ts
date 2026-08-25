import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
    shouldClearSessionAfterFailedHandoffDestroy,
    shouldClearSessionAfterLocalHandoffReady,
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

    it("clears session after local Ready only when no successor owns the slot", () => {
        const handoff = { id: "handoff" }
        const successor = { id: "successor" }

        // Destroy succeeded or failed with empty slot — safe to clear flushed snapshot.
        assert.equal(shouldClearSessionAfterLocalHandoffReady(handoff, null), true)
        // Failed destroy left the original player — clear after leftover teardown.
        assert.equal(shouldClearSessionAfterLocalHandoffReady(handoff, handoff), true)
        // /play during Ready wait installed a successor — must not wipe its session.
        assert.equal(shouldClearSessionAfterLocalHandoffReady(handoff, successor), false)
    })

    it("keeps the legacy alias in sync with the Ready clear helper", () => {
        const handoff = { id: "handoff" }
        const successor = { id: "successor" }
        assert.equal(
            shouldClearSessionAfterFailedHandoffDestroy(handoff, null),
            shouldClearSessionAfterLocalHandoffReady(handoff, null)
        )
        assert.equal(
            shouldClearSessionAfterFailedHandoffDestroy(handoff, successor),
            shouldClearSessionAfterLocalHandoffReady(handoff, successor)
        )
    })
})
