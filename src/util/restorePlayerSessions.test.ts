import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
    isStaleSessionDiscordError,
    shouldAbandonRestoreForConcurrentQueue,
    shouldPersistConcurrentAbandonSession,
    shouldPersistRestoredPlayerSession,
} from "./restorePlayerSessions.js"

describe("isStaleSessionDiscordError", () => {
    it("treats unknown channel/guild as permanently stale (safe to delete session)", () => {
        assert.equal(isStaleSessionDiscordError({ code: 10003 }), true)
        assert.equal(isStaleSessionDiscordError({ code: 10004 }), true)
        assert.equal(isStaleSessionDiscordError({ code: "10003" }), true)
    })

    it("treats permission, rate-limit, and network-shaped failures as transient (keep session)", () => {
        assert.equal(isStaleSessionDiscordError({ code: 50001 }), false) // Missing Access
        assert.equal(isStaleSessionDiscordError({ code: 50013 }), false) // Missing Permissions
        assert.equal(isStaleSessionDiscordError({ code: 429 }), false)
        assert.equal(isStaleSessionDiscordError({ code: "EAI_AGAIN" }), false)
        assert.equal(isStaleSessionDiscordError(new Error("fetch failed")), false)
        assert.equal(isStaleSessionDiscordError(null), false)
    })
})

describe("shouldPersistRestoredPlayerSession", () => {
    it("allows save when every track resolved (no transient failures)", () => {
        assert.equal(shouldPersistRestoredPlayerSession(0), true)
    })

    it("blocks save when at least one track failed transiently (partial hydrate)", () => {
        // One resolved + one transient failure must not overwrite the full prior snapshot.
        assert.equal(shouldPersistRestoredPlayerSession(1), false)
        assert.equal(shouldPersistRestoredPlayerSession(2), false)
    })
})

describe("shouldPersistConcurrentAbandonSession", () => {
    it("blocks save when restore still had playable tracks (thin concurrent queue must not wipe DB)", () => {
        assert.equal(
            shouldPersistConcurrentAbandonSession({ playableCount: 50, transientFailures: 0 }),
            false
        )
        assert.equal(
            shouldPersistConcurrentAbandonSession({ playableCount: 1, transientFailures: 0 }),
            false
        )
    })

    it("blocks save when resolve failed only transiently (even with zero playable)", () => {
        assert.equal(
            shouldPersistConcurrentAbandonSession({ playableCount: 0, transientFailures: 1 }),
            false
        )
    })

    it("allows save when every stored track failed deterministically (prior row unrecoverable)", () => {
        assert.equal(
            shouldPersistConcurrentAbandonSession({ playableCount: 0, transientFailures: 0 }),
            true
        )
    })
})

describe("shouldAbandonRestoreForConcurrentQueue", () => {
    it("keeps the player when upcoming tracks were enqueued during resolve", () => {
        assert.equal(
            shouldAbandonRestoreForConcurrentQueue({
                queue: { current: null, tracks: [{ id: "a" }] },
            }),
            true
        )
    })

    it("keeps the player when a current track is already playing", () => {
        assert.equal(
            shouldAbandonRestoreForConcurrentQueue({
                queue: { current: { id: "now" }, tracks: [] },
            }),
            true
        )
    })

    it("allows destroy/delete when the hydrate player is still empty", () => {
        assert.equal(
            shouldAbandonRestoreForConcurrentQueue({
                queue: { current: null, tracks: [] },
            }),
            false
        )
        assert.equal(
            shouldAbandonRestoreForConcurrentQueue({
                queue: { tracks: [] },
            }),
            false
        )
    })
})
