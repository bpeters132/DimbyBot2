import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
    evaluateSubscribeDebounce,
    isStaleSubscribeAttempt,
    type SubscribeLastAttempt,
} from "./wsSubscribeDecision.js"

describe("evaluateSubscribeDebounce", () => {
    const debounceMs = 4000

    it("proceeds when there is no prior attempt", () => {
        assert.deepEqual(evaluateSubscribeDebounce(undefined, "g1", 10_000, debounceMs), {
            action: "proceed",
        })
    })

    it("proceeds for a different guild even inside the debounce window", () => {
        const last: SubscribeLastAttempt = { guildId: "g1", at: 9_500, success: true }
        assert.deepEqual(evaluateSubscribeDebounce(last, "g2", 10_000, debounceMs), {
            action: "proceed",
        })
    })

    it("reuses prior success within the debounce window for the same guild", () => {
        const last: SubscribeLastAttempt = { guildId: "g1", at: 9_500, success: true }
        assert.deepEqual(evaluateSubscribeDebounce(last, "g1", 10_000, debounceMs), {
            action: "reuse",
            success: true,
        })
    })

    it("reuses prior failure within the debounce window for the same guild", () => {
        const last: SubscribeLastAttempt = { guildId: "g1", at: 9_500, success: false }
        assert.deepEqual(evaluateSubscribeDebounce(last, "g1", 10_000, debounceMs), {
            action: "reuse",
            success: false,
        })
    })

    it("proceeds again once the debounce window has elapsed", () => {
        const last: SubscribeLastAttempt = { guildId: "g1", at: 5_000, success: true }
        assert.deepEqual(evaluateSubscribeDebounce(last, "g1", 10_000, debounceMs), {
            action: "proceed",
        })
    })

    it("treats the debounce boundary as exclusive (elapsed === debounceMs proceeds)", () => {
        const last: SubscribeLastAttempt = { guildId: "g1", at: 6_000, success: false }
        assert.deepEqual(evaluateSubscribeDebounce(last, "g1", 10_000, debounceMs), {
            action: "proceed",
        })
    })
})

describe("isStaleSubscribeAttempt", () => {
    it("keeps the matching generation and rejects older/missing generations", () => {
        assert.equal(isStaleSubscribeAttempt(3, 3), false)
        assert.equal(isStaleSubscribeAttempt(4, 3), true)
        assert.equal(isStaleSubscribeAttempt(undefined, 1), true)
        assert.equal(isStaleSubscribeAttempt(0, 1), true)
    })

    it("treats an unsubscribe generation bump as stale for the pending attempt", () => {
        const pendingGeneration = 2
        const afterUnsubscribe = pendingGeneration + 1
        assert.equal(isStaleSubscribeAttempt(afterUnsubscribe, pendingGeneration), true)
    })
})
