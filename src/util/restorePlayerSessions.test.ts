import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
    isStaleSessionDiscordError,
    shouldAbandonRestoreForConcurrentQueue,
    shouldDeleteStaleRestoredSession,
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

describe("shouldDeleteStaleRestoredSession", () => {
    const evaluated = {
        voiceChannelId: "vc-old",
        updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    }

    it("deletes when the DB row is still the evaluated stale session", () => {
        assert.equal(
            shouldDeleteStaleRestoredSession({
                evaluated,
                latest: { ...evaluated },
                livePlayerExists: false,
            }),
            true
        )
    })

    it("skips delete when a live player already owns the guild", () => {
        assert.equal(
            shouldDeleteStaleRestoredSession({
                evaluated,
                latest: { ...evaluated },
                livePlayerExists: true,
            }),
            false
        )
    })

    it("skips delete when a successor session replaced the row during fetch", () => {
        assert.equal(
            shouldDeleteStaleRestoredSession({
                evaluated,
                latest: {
                    voiceChannelId: "vc-new",
                    updatedAt: new Date("2026-08-01T00:01:00.000Z"),
                },
                livePlayerExists: false,
            }),
            false
        )
    })

    it("skips delete when the row was already cleared", () => {
        assert.equal(
            shouldDeleteStaleRestoredSession({
                evaluated,
                latest: null,
                livePlayerExists: false,
            }),
            false
        )
    })
})
