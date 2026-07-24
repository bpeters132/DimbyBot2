import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { discordLogLevelAllowed, logMessageBelongsToGuild } from "./discordLogForward.js"

describe("logMessageBelongsToGuild", () => {
    const guildA = "123456789012345678"
    const guildB = "987654321098765432"

    it("requires the guild snowflake to appear as its own digit run", () => {
        assert.equal(
            logMessageBelongsToGuild(
                `[MusicManager] handleQueryAndPlay called for guild ${guildA}. Query: "song"`,
                guildA
            ),
            true
        )
        assert.equal(
            logMessageBelongsToGuild(
                `[MusicManager] handleQueryAndPlay called for guild ${guildA}. Query: "song"`,
                guildB
            ),
            false
        )
    })

    it("rejects process-wide logs with no guild id (prevents cross-tenant fan-out)", () => {
        assert.equal(logMessageBelongsToGuild("[Database] Database connection verified.", guildA), false)
        assert.equal(logMessageBelongsToGuild("Lavalink Node main CONNECTED", guildA), false)
    })

    it("rejects invalid guild ids and substring digit matches", () => {
        assert.equal(logMessageBelongsToGuild(`guild ${guildA}`, ""), false)
        assert.equal(logMessageBelongsToGuild(`guild ${guildA}`, "not-a-snowflake"), false)
        assert.equal(logMessageBelongsToGuild(`id ${guildA}9`, guildA), false)
    })
})

describe("discordLogLevelAllowed", () => {
    it("defaults minLevel to debug", () => {
        assert.equal(discordLogLevelAllowed({}, "info"), true)
        assert.equal(discordLogLevelAllowed({ minLevel: "warn" }, "info"), false)
        assert.equal(discordLogLevelAllowed({ minLevel: "warn" }, "error"), true)
    })
})
