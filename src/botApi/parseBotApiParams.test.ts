import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
    clampInt,
    parseEnqueueQuery,
    parsePlayerAction,
    parsePlayerSeekMs,
    parsePreferredGuildId,
    parseQueueIndex,
    parseQueueQueryNumber,
    parseQueueReorderNewIndex,
} from "./parseBotApiParams.js"

describe("clampInt", () => {
    it("clamps to inclusive bounds", () => {
        assert.equal(clampInt(5, 1, 10), 5)
        assert.equal(clampInt(-3, 1, 10), 1)
        assert.equal(clampInt(99, 1, 10), 10)
    })
})

describe("parseQueueQueryNumber", () => {
    it("uses fallback for null or non-finite values", () => {
        assert.equal(parseQueueQueryNumber(null, 20, 1, 100), 20)
        assert.equal(parseQueueQueryNumber("nope", 20, 1, 100), 20)
        assert.equal(parseQueueQueryNumber("Infinity", 20, 1, 100), 20)
        assert.equal(parseQueueQueryNumber("NaN", 20, 1, 100), 20)
    })

    it("truncates toward zero then clamps (page/limit contract)", () => {
        assert.equal(parseQueueQueryNumber("3.9", 1, 1, 10_000), 3)
        assert.equal(parseQueueQueryNumber("-2.7", 1, 1, 10_000), 1)
        assert.equal(parseQueueQueryNumber("99999", 20, 1, 100), 100)
        assert.equal(parseQueueQueryNumber("0", 20, 1, 100), 1)
    })
})

describe("parseQueueIndex", () => {
    it("accepts non-negative integers including zero", () => {
        assert.equal(parseQueueIndex("0"), 0)
        assert.equal(parseQueueIndex("12"), 12)
    })

    it("rejects floats, negatives, and non-numeric strings", () => {
        assert.equal(parseQueueIndex("1.5"), null)
        assert.equal(parseQueueIndex("-1"), null)
        assert.equal(parseQueueIndex("abc"), null)
        assert.equal(parseQueueIndex("Infinity"), null)
    })

    it("treats empty string as 0 via Number('') (existing queue index contract)", () => {
        assert.equal(parseQueueIndex(""), 0)
    })

    it("accepts values Number parses as non-negative integers (leading zeros / 1e2)", () => {
        assert.equal(parseQueueIndex("01"), 1)
        assert.equal(parseQueueIndex("1e2"), 100)
    })
})

describe("parsePlayerAction", () => {
    it("accepts the known player control actions", () => {
        for (const action of ["pause", "skip", "stop", "seek", "loop", "shuffle", "autoplay"]) {
            assert.equal(parsePlayerAction(action), action)
        }
    })

    it("rejects unknown actions and non-strings", () => {
        assert.equal(parsePlayerAction("destroy"), null)
        assert.equal(parsePlayerAction("PAUSE"), null)
        assert.equal(parsePlayerAction(""), null)
        assert.equal(parsePlayerAction(null), null)
        assert.equal(parsePlayerAction(1), null)
        assert.equal(parsePlayerAction({ action: "skip" }), null)
    })
})

describe("parsePlayerSeekMs", () => {
    it("accepts finite non-negative numbers and floors fractional milliseconds", () => {
        assert.equal(parsePlayerSeekMs(0), 0)
        assert.equal(parsePlayerSeekMs(1), 1)
        assert.equal(parsePlayerSeekMs(1000.9), 1000)
        assert.equal(parsePlayerSeekMs(59_999.1), 59_999)
    })

    it("rejects negatives, non-finite numbers, numeric strings, and other types", () => {
        assert.equal(parsePlayerSeekMs(-1), null)
        assert.equal(parsePlayerSeekMs(-0.1), null)
        assert.equal(parsePlayerSeekMs(Number.NaN), null)
        assert.equal(parsePlayerSeekMs(Number.POSITIVE_INFINITY), null)
        assert.equal(parsePlayerSeekMs(Number.NEGATIVE_INFINITY), null)
        assert.equal(parsePlayerSeekMs("1000"), null)
        assert.equal(parsePlayerSeekMs("0"), null)
        assert.equal(parsePlayerSeekMs(null), null)
        assert.equal(parsePlayerSeekMs(undefined), null)
        assert.equal(parsePlayerSeekMs(true), null)
        assert.equal(parsePlayerSeekMs({ value: 1 }), null)
        assert.equal(parsePlayerSeekMs([1000]), null)
    })
})

describe("parseQueueReorderNewIndex", () => {
    it("accepts non-negative integer numbers including zero", () => {
        assert.equal(parseQueueReorderNewIndex(0), 0)
        assert.equal(parseQueueReorderNewIndex(1), 1)
        assert.equal(parseQueueReorderNewIndex(12), 12)
    })

    it("rejects floats, negatives, digit strings, and other types", () => {
        assert.equal(parseQueueReorderNewIndex(1.5), null)
        assert.equal(parseQueueReorderNewIndex(-1), null)
        assert.equal(parseQueueReorderNewIndex(Number.NaN), null)
        assert.equal(parseQueueReorderNewIndex(Number.POSITIVE_INFINITY), null)
        assert.equal(parseQueueReorderNewIndex("1"), null)
        assert.equal(parseQueueReorderNewIndex("0"), null)
        assert.equal(parseQueueReorderNewIndex("1.5"), null)
        assert.equal(parseQueueReorderNewIndex(null), null)
        assert.equal(parseQueueReorderNewIndex(undefined), null)
        assert.equal(parseQueueReorderNewIndex(true), null)
        assert.equal(parseQueueReorderNewIndex({ newIndex: 1 }), null)
    })
})

describe("parseEnqueueQuery", () => {
    it("accepts trimmed non-empty search strings", () => {
        assert.equal(parseEnqueueQuery("never gonna"), "never gonna")
        assert.equal(parseEnqueueQuery("  never gonna  "), "never gonna")
        assert.equal(
            parseEnqueueQuery("https://youtu.be/dQw4w9WgXcQ"),
            "https://youtu.be/dQw4w9WgXcQ"
        )
    })

    it("rejects empty, whitespace-only, and non-string values so Lavalink is not searched", () => {
        assert.equal(parseEnqueueQuery(""), null)
        assert.equal(parseEnqueueQuery("   "), null)
        assert.equal(parseEnqueueQuery("\n\t"), null)
        assert.equal(parseEnqueueQuery(null), null)
        assert.equal(parseEnqueueQuery(undefined), null)
        assert.equal(parseEnqueueQuery(1), null)
        assert.equal(parseEnqueueQuery({ query: "song" }), null)
        assert.equal(parseEnqueueQuery(["song"]), null)
    })
})

describe("parsePreferredGuildId", () => {
    it("accepts trimmed non-empty guild ids", () => {
        assert.equal(parsePreferredGuildId("123456789012345678"), "123456789012345678")
        assert.equal(parsePreferredGuildId("  123456789012345678  "), "123456789012345678")
    })

    it("treats empty, whitespace-only, and non-string values as absent", () => {
        assert.equal(parsePreferredGuildId(""), undefined)
        assert.equal(parsePreferredGuildId("   "), undefined)
        assert.equal(parsePreferredGuildId("\n\t"), undefined)
        assert.equal(parsePreferredGuildId(null), undefined)
        assert.equal(parsePreferredGuildId(undefined), undefined)
        assert.equal(parsePreferredGuildId(1), undefined)
        assert.equal(parsePreferredGuildId({ guildId: "123" }), undefined)
        assert.equal(parsePreferredGuildId(["123456789012345678"]), undefined)
    })
})
