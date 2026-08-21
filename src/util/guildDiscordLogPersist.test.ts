import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { Prisma } from "@prisma/client"
import {
    normalizeDiscordLogForDatabase,
    parseGuildDiscordLog,
    toSafeJsonObject,
} from "./guildDiscordLogPersist.js"

describe("toSafeJsonObject", () => {
    it("rejects arrays, null, and non-objects", () => {
        assert.equal(toSafeJsonObject(null), null)
        assert.equal(toSafeJsonObject([1]), null)
        assert.equal(toSafeJsonObject("x"), null)
    })

    it("returns null for non-JSON-serializable objects", () => {
        const circular: Record<string, unknown> = {}
        circular.self = circular
        assert.equal(toSafeJsonObject(circular), null)
    })

    it("round-trips plain objects", () => {
        assert.deepEqual(toSafeJsonObject({ allChannelId: "c1" }), { allChannelId: "c1" })
    })
})

describe("normalizeDiscordLogForDatabase", () => {
    it("maps nullish / invalid / non-object values to DbNull", () => {
        assert.equal(normalizeDiscordLogForDatabase(null), Prisma.DbNull)
        assert.equal(normalizeDiscordLogForDatabase(undefined), Prisma.DbNull)
        assert.equal(normalizeDiscordLogForDatabase(42), Prisma.DbNull)
        assert.equal(normalizeDiscordLogForDatabase(["nope"]), Prisma.DbNull)
        assert.equal(normalizeDiscordLogForDatabase("{not-json"), Prisma.DbNull)
        assert.equal(normalizeDiscordLogForDatabase("[1,2]"), Prisma.DbNull)
    })

    it("parses legacy JSON strings into objects", () => {
        assert.deepEqual(
            normalizeDiscordLogForDatabase('{"allChannelId":"123","minLevel":"warn"}'),
            { allChannelId: "123", minLevel: "warn" }
        )
    })

    it("accepts plain objects and rejects circular graphs", () => {
        assert.deepEqual(normalizeDiscordLogForDatabase({ byLevel: { error: "e1" } }), {
            byLevel: { error: "e1" },
        })
        const circular: Record<string, unknown> = {}
        circular.self = circular
        assert.equal(normalizeDiscordLogForDatabase(circular), Prisma.DbNull)
    })
})

describe("parseGuildDiscordLog", () => {
    it("returns undefined for null, arrays, and empty usable fields", () => {
        assert.equal(parseGuildDiscordLog(null), undefined)
        assert.equal(parseGuildDiscordLog([] as never), undefined)
        assert.equal(parseGuildDiscordLog({}), undefined)
        assert.equal(parseGuildDiscordLog({ allChannelId: "   " }), undefined)
        assert.equal(parseGuildDiscordLog({ minLevel: "trace" }), undefined)
        assert.equal(parseGuildDiscordLog({ byLevel: { fatal: "x", error: "" } }), undefined)
    })

    it("trims channel ids and keeps only known levels", () => {
        assert.deepEqual(
            parseGuildDiscordLog({
                allChannelId: "  chan-all  ",
                minLevel: "info",
                byLevel: {
                    error: "  err-chan  ",
                    warn: "",
                    nope: "ignored",
                    debug: "dbg",
                },
                extra: true,
            }),
            {
                allChannelId: "chan-all",
                minLevel: "info",
                byLevel: { error: "err-chan", debug: "dbg" },
            }
        )
    })

    it("keeps minLevel alone when channel maps are empty", () => {
        assert.deepEqual(parseGuildDiscordLog({ minLevel: "error", byLevel: {} }), {
            minLevel: "error",
        })
    })
})
