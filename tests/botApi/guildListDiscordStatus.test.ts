import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { mapDiscordGuildListFailureStatus } from "../../src/botApi/guildListDiscordStatus.js"

describe("mapDiscordGuildListFailureStatus", () => {
    it("passes through finite Discord 4xx/5xx so the dashboard can re-auth or retry", () => {
        assert.equal(mapDiscordGuildListFailureStatus(401), 401)
        assert.equal(mapDiscordGuildListFailureStatus(403), 403)
        assert.equal(mapDiscordGuildListFailureStatus(429), 429)
        assert.equal(mapDiscordGuildListFailureStatus(500), 500)
        assert.equal(mapDiscordGuildListFailureStatus(503), 503)
        assert.equal(mapDiscordGuildListFailureStatus(599), 599)
        assert.equal(mapDiscordGuildListFailureStatus(400), 400)
    })

    it("fails closed to 502 for status 0, non-error HTTP, out-of-range, and non-finite values", () => {
        assert.equal(mapDiscordGuildListFailureStatus(0), 502)
        assert.equal(mapDiscordGuildListFailureStatus(200), 502)
        assert.equal(mapDiscordGuildListFailureStatus(204), 502)
        assert.equal(mapDiscordGuildListFailureStatus(301), 502)
        assert.equal(mapDiscordGuildListFailureStatus(399), 502)
        assert.equal(mapDiscordGuildListFailureStatus(600), 502)
        assert.equal(mapDiscordGuildListFailureStatus(999), 502)
        assert.equal(mapDiscordGuildListFailureStatus(Number.NaN), 502)
        assert.equal(mapDiscordGuildListFailureStatus(Number.POSITIVE_INFINITY), 502)
        assert.equal(mapDiscordGuildListFailureStatus(undefined), 502)
        assert.equal(mapDiscordGuildListFailureStatus("401"), 502)
        assert.equal(mapDiscordGuildListFailureStatus(null), 502)
    })
})
