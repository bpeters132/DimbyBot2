import assert from "node:assert/strict"
import { afterEach, beforeEach, describe, it } from "node:test"
import {
    captureError,
    clearErrorHistory,
    getErrorsByGuild,
    getRecentErrors,
} from "./errorHistory.js"

const GUILD_A = "123456789012345678"
const GUILD_B = "987654321098765432"

describe("errorHistory", () => {
    beforeEach(() => {
        clearErrorHistory()
    })

    afterEach(() => {
        clearErrorHistory()
    })

    it("extracts the first Discord snowflake from the message as guildId", () => {
        captureError("error", `player failed in guild ${GUILD_A} after skip`, 1_000)
        const [entry] = getRecentErrors(1)
        assert.equal(entry?.guildId, GUILD_A)
        assert.equal(entry?.level, "error")
        assert.equal(entry?.timestamp, 1_000)
    })

    it("ignores short numeric ids and leaves guildId unset when none match", () => {
        captureError("warn", "code 404 for user 12345", 2_000)
        const [entry] = getRecentErrors(1)
        assert.equal(entry?.guildId, undefined)
        assert.equal(entry?.level, "warn")
    })

    it("filters by extracted guildId and returns newest first", () => {
        captureError("error", `guild ${GUILD_A} first`, 1)
        captureError("error", `guild ${GUILD_B} only`, 2)
        captureError("warn", `guild ${GUILD_A} second`, 3)

        const forA = getErrorsByGuild(GUILD_A, 10)
        assert.equal(forA.length, 2)
        assert.equal(forA[0]?.timestamp, 3)
        assert.equal(forA[1]?.timestamp, 1)

        const forB = getErrorsByGuild(GUILD_B, 10)
        assert.equal(forB.length, 1)
        assert.equal(forB[0]?.timestamp, 2)
    })

    it("caps getRecentErrors / getErrorsByGuild limits and clears the buffer", () => {
        for (let i = 0; i < 5; i++) {
            captureError("error", `guild ${GUILD_A} n=${i}`, i)
        }
        assert.equal(getRecentErrors(2).length, 2)
        assert.equal(getRecentErrors(0).length, 1)
        assert.equal(getErrorsByGuild(GUILD_A, 3).length, 3)

        clearErrorHistory()
        assert.equal(getRecentErrors(10).length, 0)
        assert.equal(getErrorsByGuild(GUILD_A, 10).length, 0)
    })

    it("preserves an optional stack on captured entries", () => {
        captureError("error", "boom", 9, "Error: boom\n    at x")
        const [entry] = getRecentErrors(1)
        assert.equal(entry?.stack, "Error: boom\n    at x")
    })
})
