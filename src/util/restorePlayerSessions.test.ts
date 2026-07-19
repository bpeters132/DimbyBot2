import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { isStaleSessionDiscordError } from "./restorePlayerSessions.js"

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
