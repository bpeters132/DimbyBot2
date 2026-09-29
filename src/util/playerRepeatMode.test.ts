import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { nextPlayerRepeatMode } from "./playerRepeatMode.js"

describe("nextPlayerRepeatMode", () => {
    it("cycles off → track → queue → off", () => {
        assert.equal(nextPlayerRepeatMode("off"), "track")
        assert.equal(nextPlayerRepeatMode("track"), "queue")
        assert.equal(nextPlayerRepeatMode("queue"), "off")
        assert.equal(nextPlayerRepeatMode(nextPlayerRepeatMode("queue")), "track")
    })

    it("fails closed to off for unknown or missing Lavalink modes", () => {
        assert.equal(nextPlayerRepeatMode(undefined), "off")
        assert.equal(nextPlayerRepeatMode(null), "off")
        assert.equal(nextPlayerRepeatMode(""), "off")
        assert.equal(nextPlayerRepeatMode("TRACK"), "off")
        assert.equal(nextPlayerRepeatMode("repeat"), "off")
    })
})
