import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { companionKeyLengthOk } from "./stackStatus.js"

describe("companionKeyLengthOk", () => {
    it("accepts exactly 16 alphanumeric characters", () => {
        assert.equal(companionKeyLengthOk("changemechangeme"), true)
        assert.equal(companionKeyLengthOk("Abcdefghijklmno1"), true)
    })

    it("rejects wrong length or non-alphanumeric", () => {
        assert.equal(companionKeyLengthOk(""), false)
        assert.equal(companionKeyLengthOk("short"), false)
        assert.equal(companionKeyLengthOk("changemechangemeX"), false)
        assert.equal(companionKeyLengthOk("changeme-changem"), false)
        assert.equal(companionKeyLengthOk(" changemechangeme"), false)
        assert.equal(companionKeyLengthOk("changemechangeme "), false)
    })
})
