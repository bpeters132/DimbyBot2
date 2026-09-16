import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
    runLocalHandoffLavalinkStopAndDestroy,
    shouldAbortLocalPlayForLivePlayerConflict,
    shouldClearSessionAfterFailedHandoffDestroy,
    shouldClearSessionAfterLocalHandoffReady,
    shouldDestroyLeftoverHandoffPlayer,
    shouldRunLocalHandoffLavalinkTeardown,
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

    it("refuses guild-keyed stop/destroy when the live player is not the handoff instance", () => {
        const handoff = { id: "handoff" }
        const successor = { id: "successor" }

        assert.equal(shouldRunLocalHandoffLavalinkTeardown(handoff, handoff), true)
        assert.equal(shouldRunLocalHandoffLavalinkTeardown(handoff, successor), false)
        assert.equal(shouldRunLocalHandoffLavalinkTeardown(handoff, null), false)
        assert.equal(shouldRunLocalHandoffLavalinkTeardown(handoff, undefined), false)
    })
})

describe("runLocalHandoffLavalinkStopAndDestroy", () => {
    it("skips stop and destroy when a successor already owns the slot", async () => {
        const handoff = { id: "handoff" }
        const successor = { id: "successor" }
        let stopCalls = 0
        let destroyCalls = 0

        const destroyed = await runLocalHandoffLavalinkStopAndDestroy({
            handoffPlayer: handoff,
            getLivePlayer: () => successor,
            isPlaying: true,
            stopPlaying: async () => {
                stopCalls += 1
            },
            destroy: async () => {
                destroyCalls += 1
            },
        })

        assert.equal(destroyed, false)
        assert.equal(stopCalls, 0)
        assert.equal(destroyCalls, 0)
    })

    it("skips stop and destroy when the guild slot is empty", async () => {
        const handoff = { id: "handoff" }
        let stopCalls = 0
        let destroyCalls = 0

        const destroyed = await runLocalHandoffLavalinkStopAndDestroy({
            handoffPlayer: handoff,
            getLivePlayer: () => undefined,
            isPlaying: true,
            stopPlaying: async () => {
                stopCalls += 1
            },
            destroy: async () => {
                destroyCalls += 1
            },
        })

        assert.equal(destroyed, false)
        assert.equal(stopCalls, 0)
        assert.equal(destroyCalls, 0)
    })

    it("skips destroy when a successor replaces the player while stopPlaying is pending", async () => {
        const handoff = { id: "handoff" }
        const successor = { id: "successor" }
        let live: object = handoff
        let destroyCalls = 0
        let beforeDestroyCalls = 0

        const destroyed = await runLocalHandoffLavalinkStopAndDestroy({
            handoffPlayer: handoff,
            getLivePlayer: () => live,
            isPlaying: true,
            stopPlaying: async () => {
                live = successor
            },
            beforeDestroy: () => {
                beforeDestroyCalls += 1
            },
            destroy: async () => {
                destroyCalls += 1
            },
        })

        assert.equal(destroyed, false)
        assert.equal(destroyCalls, 0)
        assert.equal(beforeDestroyCalls, 0)
    })

    it("destroys when the same instance still owns the slot after stopPlaying", async () => {
        const handoff = { id: "handoff" }
        let stopCalls = 0
        let destroyCalls = 0
        let beforeDestroyCalls = 0

        const destroyed = await runLocalHandoffLavalinkStopAndDestroy({
            handoffPlayer: handoff,
            getLivePlayer: () => handoff,
            isPlaying: true,
            stopPlaying: async () => {
                stopCalls += 1
            },
            beforeDestroy: () => {
                beforeDestroyCalls += 1
            },
            destroy: async () => {
                destroyCalls += 1
            },
        })

        assert.equal(destroyed, true)
        assert.equal(stopCalls, 1)
        assert.equal(beforeDestroyCalls, 1)
        assert.equal(destroyCalls, 1)
    })

    it("still destroys when stopPlaying throws if ownership is unchanged", async () => {
        const handoff = { id: "handoff" }
        let destroyCalls = 0
        let stopErrors = 0

        const destroyed = await runLocalHandoffLavalinkStopAndDestroy({
            handoffPlayer: handoff,
            getLivePlayer: () => handoff,
            isPlaying: true,
            stopPlaying: async () => {
                throw new Error("stop failed")
            },
            onStopError: () => {
                stopErrors += 1
            },
            destroy: async () => {
                destroyCalls += 1
            },
        })

        assert.equal(destroyed, true)
        assert.equal(stopErrors, 1)
        assert.equal(destroyCalls, 1)
    })
})
