import assert from "node:assert/strict"
import { describe, it, mock } from "node:test"

const local = {
    pending: false,
    localState: null as { isPlaying: boolean; trackTitle?: string } | null,
    cancelCalls: 0,
    stopCalls: 0,
}

mock.module("../../src/util/localPlayer.js", {
    namedExports: {
        isPendingLocalPlay: (guildId: string) => {
            void guildId
            return local.pending
        },
        cancelPendingLocalPlay: (guildId: string) => {
            void guildId
            local.cancelCalls += 1
            local.pending = false
        },
        getLocalPlayerState: (guildId: string) => {
            void guildId
            return local.localState
        },
        stopLocalPlayer: (_client: unknown, guildId: string) => {
            void guildId
            local.stopCalls += 1
            local.localState = null
            return true
        },
    },
})

const { stopLocalPlaybackForUserStop, userStopAffectedLocalPlayback } =
    await import("../../src/util/stopLocalForUserStop.js")

describe("stopLocalPlaybackForUserStop", () => {
    it("cancels pending local and stops mapped local state", () => {
        local.pending = true
        local.localState = { isPlaying: true, trackTitle: "a.wav" }
        local.cancelCalls = 0
        local.stopCalls = 0

        const result = stopLocalPlaybackForUserStop({ debug() {} } as never, "guild-1")

        assert.deepEqual(result, { cancelledPending: true, stoppedLocal: true })
        assert.equal(local.cancelCalls, 1)
        assert.equal(local.stopCalls, 1)
        assert.equal(userStopAffectedLocalPlayback(result), true)
    })

    it("cancels pending alone when no mapped local player exists", () => {
        local.pending = true
        local.localState = null
        local.cancelCalls = 0
        local.stopCalls = 0

        const result = stopLocalPlaybackForUserStop({ debug() {} } as never, "guild-1")

        assert.deepEqual(result, { cancelledPending: true, stoppedLocal: false })
        assert.equal(local.cancelCalls, 1)
        assert.equal(local.stopCalls, 0)
        assert.equal(userStopAffectedLocalPlayback(result), true)
    })

    it("no-ops when nothing local is active", () => {
        local.pending = false
        local.localState = null
        local.cancelCalls = 0
        local.stopCalls = 0

        const result = stopLocalPlaybackForUserStop({ debug() {} } as never, "guild-1")

        assert.deepEqual(result, { cancelledPending: false, stoppedLocal: false })
        assert.equal(userStopAffectedLocalPlayback(result), false)
    })
})
