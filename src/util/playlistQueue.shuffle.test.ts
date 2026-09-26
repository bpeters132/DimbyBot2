import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"
import { shuffleArray } from "./playlistQueue.js"

describe("shuffleArray", () => {
    const originalRandom = Math.random

    afterEach(() => {
        Math.random = originalRandom
    })

    it("returns a shallow copy and does not mutate the input", () => {
        const input = ["a", "b", "c"]
        const frozen = [...input]
        Math.random = () => 0
        const shuffled = shuffleArray(input)
        assert.deepEqual(input, frozen)
        assert.notEqual(shuffled, input)
        assert.deepEqual(shuffled, ["b", "c", "a"])
    })

    it("preserves membership including duplicates", () => {
        const input = ["x", "x", "y"]
        Math.random = () => 0.999
        const shuffled = shuffleArray(input)
        assert.deepEqual([...shuffled].sort(), [...input].sort())
        assert.equal(shuffled.length, input.length)
    })

    it("is a no-op for empty and single-element lists", () => {
        assert.deepEqual(shuffleArray([]), [])
        assert.deepEqual(shuffleArray(["only"]), ["only"])
    })
})
