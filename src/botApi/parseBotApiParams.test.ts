import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
    clampInt,
    parsePlayerAction,
    parseQueueIndex,
    parseQueueQueryNumber,
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
