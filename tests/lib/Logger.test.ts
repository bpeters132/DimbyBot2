import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { DiscordLogLevelName } from "../../src/types/index.js"
import Logger from "../../src/lib/Logger.js"

describe("Logger.child Discord forwarder", () => {
    const guildA = "123456789012345678"
    const guildB = "987654321098765432"

    it("passes the child guild id to the forward callback and ignores ids in the text", () => {
        const forwarded: Array<{
            level: DiscordLogLevelName
            message: string
            guildId: string | null
        }> = []
        const logger = new Logger()
        logger.setDebugEnabled(true)
        logger.setDiscordForwarder((level, message, guildId) => {
            forwarded.push({ level, message, guildId })
        })

        const steered =
            `in guild Logs (${guildB}) query "${guildB}" ` +
            `stderr guild=${guildB} guildId=${guildB} Error: for ${guildB}`
        logger.child({ guildId: guildA }).warn(steered)

        assert.equal(forwarded.length, 1)
        assert.equal(forwarded[0]?.level, "warn")
        assert.equal(forwarded[0]?.guildId, guildA)
        assert.match(forwarded[0]?.message ?? "", new RegExp(guildB))

        logger.info("process log with no guild")
        assert.equal(forwarded[1]?.guildId, null)
        assert.equal(forwarded[1]?.message, "process log with no guild")

        logger.child({ guildId: guildA }).child({ guildId: guildB }).error("switched guild")
        assert.equal(forwarded[2]?.guildId, guildB)
        assert.equal(forwarded[2]?.message, "switched guild")
    })
})
