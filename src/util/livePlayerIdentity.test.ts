import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { isSameLivePlayer } from "./livePlayerIdentity.js"

describe("isSameLivePlayer", () => {
    it("accepts the same Player reference", () => {
        const player = { guildId: "g1" }
        assert.equal(isSameLivePlayer(player, player), true)
    })

    it("rejects null, undefined, and a successor instance", () => {
        const expected = { guildId: "g1" }
        const successor = { guildId: "g1" }
        assert.equal(isSameLivePlayer(null, expected), false)
        assert.equal(isSameLivePlayer(undefined, expected), false)
        assert.equal(isSameLivePlayer(successor, expected), false)
    })
})
