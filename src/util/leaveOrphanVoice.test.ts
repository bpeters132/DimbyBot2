import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
    planLeaveAbsentLavalinkActions,
    shouldDisconnectOrphanVoice,
    shouldTearDownAbsentLavalinkOnLeave,
} from "./leaveOrphanVoice.js"

describe("shouldDisconnectOrphanVoice", () => {
    it("disconnects only when there is no Lavalink player and the bot is still in a VC", () => {
        assert.equal(shouldDisconnectOrphanVoice(false, true), true)
        assert.equal(shouldDisconnectOrphanVoice(false, false), false)
        assert.equal(shouldDisconnectOrphanVoice(true, true), false)
        assert.equal(shouldDisconnectOrphanVoice(true, false), false)
    })
})

describe("shouldTearDownAbsentLavalinkOnLeave", () => {
    it("allows teardown only when no live player appeared after the null check", () => {
        assert.equal(shouldTearDownAbsentLavalinkOnLeave(null), true)
        assert.equal(shouldTearDownAbsentLavalinkOnLeave(undefined), true)
        assert.equal(shouldTearDownAbsentLavalinkOnLeave({ id: "successor" }), false)
    })
})

describe("planLeaveAbsentLavalinkActions", () => {
    const none = {
        destroyPlayerByGuildId: false as const,
        disconnectOrphanVoice: false,
        forceClearSession: false,
    }

    it("never plans guild-keyed destroyPlayer, even when tearing down orphan voice", () => {
        const plan = planLeaveAbsentLavalinkActions({
            livePlayer: null,
            botInVoice: true,
            stoppedLocal: false,
        })
        assert.equal(plan.destroyPlayerByGuildId, false)
        assert.equal(plan.disconnectOrphanVoice, true)
        assert.equal(plan.forceClearSession, true)
    })

    it("skips disconnect, force-clear, and destroy when nothing local or orphan remains", () => {
        assert.deepEqual(
            planLeaveAbsentLavalinkActions({
                livePlayer: null,
                botInVoice: false,
                stoppedLocal: false,
            }),
            none
        )
    })

    it("skips teardown when a successor already owns the guild slot", () => {
        const successor = { id: "successor" }
        assert.deepEqual(
            planLeaveAbsentLavalinkActions({
                livePlayer: successor,
                botInVoice: true,
                stoppedLocal: true,
            }),
            none
        )
    })

    it("force-clears a leftover session after local-only stop without disconnecting Discord", () => {
        const plan = planLeaveAbsentLavalinkActions({
            livePlayer: undefined,
            botInVoice: false,
            stoppedLocal: true,
        })
        assert.deepEqual(plan, {
            destroyPlayerByGuildId: false,
            disconnectOrphanVoice: false,
            forceClearSession: true,
        })
    })
})
