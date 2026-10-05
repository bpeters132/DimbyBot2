import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
    mapSearchAndEnqueuePreflightFailure,
    type SearchAndEnqueuePreflightKind,
} from "../../src/botApi/searchAndEnqueuePreflight.js"

describe("mapSearchAndEnqueuePreflightFailure", () => {
    it("maps guild missing to 404, not 403 or 503", () => {
        const mapped = mapSearchAndEnqueuePreflightFailure("guild_missing")
        assert.equal(mapped.ok, false)
        assert.equal(mapped.status, 404)
        assert.equal(mapped.error.error, "Guild not found in bot cache.")
    })

    it("maps transient member fetch to 503 so the dashboard retries, not 404 unknown-member", () => {
        const mapped = mapSearchAndEnqueuePreflightFailure("member_fetch_transient")
        assert.equal(mapped.status, 503)
        assert.equal(mapped.error.error, "Unable to verify voice state, please try again.")
        assert.notEqual(mapped.status, 404)
    })

    it("maps missing voice channel to 400 join-VC, not 403 occupied-channel", () => {
        const mapped = mapSearchAndEnqueuePreflightFailure("not_in_voice")
        assert.equal(mapped.status, 400)
        assert.equal(mapped.error.error, "Join a voice channel first.")
        assert.notEqual(
            mapped.error.error,
            mapSearchAndEnqueuePreflightFailure("occupied_voice_mismatch").error.error
        )
    })

    it("maps bot-not-ready to 503 with permission-check copy, not access denial", () => {
        const mapped = mapSearchAndEnqueuePreflightFailure("bot_not_ready")
        assert.equal(mapped.status, 503)
        assert.equal(mapped.error.error, "Bot not ready; cannot verify voice permissions.")
        assert.notEqual(mapped.status, 403)
    })

    it("keeps join-permission unknown vs denied as distinct 403 copy", () => {
        const unknown = mapSearchAndEnqueuePreflightFailure("join_perms_unknown")
        const denied = mapSearchAndEnqueuePreflightFailure("join_perms_denied")
        assert.equal(unknown.status, 403)
        assert.equal(denied.status, 403)
        assert.equal(
            unknown.error.error,
            "Could not determine bot permissions for this voice channel."
        )
        assert.equal(denied.error.error, "Bot lacks permission to join this voice channel.")
        assert.notEqual(unknown.error.error, denied.error.error)
    })

    it("maps occupied-voice mismatch to 403 same-VC, not 400 join-first", () => {
        const mapped = mapSearchAndEnqueuePreflightFailure("occupied_voice_mismatch")
        assert.equal(mapped.status, 403)
        assert.equal(mapped.error.error, "You need to be in the same voice channel as the bot.")
        assert.notEqual(mapped.status, 400)
    })

    it("never uses 409 for voice-setup failures (that status is live-player race)", () => {
        const kinds: SearchAndEnqueuePreflightKind[] = [
            "guild_missing",
            "member_fetch_transient",
            "not_in_voice",
            "bot_not_ready",
            "join_perms_unknown",
            "join_perms_denied",
            "occupied_voice_mismatch",
        ]
        for (const kind of kinds) {
            assert.notEqual(mapSearchAndEnqueuePreflightFailure(kind).status, 409)
        }
    })
})
