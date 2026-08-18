import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
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
})
