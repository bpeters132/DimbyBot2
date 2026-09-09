import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { getLivePlayerIfUnchanged, isSameLivePlayer } from "./livePlayerIdentity.js"

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

describe("getLivePlayerIfUnchanged", () => {
    it("returns the live player when identity matches", () => {
        const player = { id: "a" }
        assert.equal(
            getLivePlayerIfUnchanged(() => player, player),
            player
        )
    })

    it("returns null when the player was destroyed", () => {
        const zombie = { id: "a" }
        assert.equal(
            getLivePlayerIfUnchanged(() => undefined, zombie),
            null
        )
        assert.equal(
            getLivePlayerIfUnchanged(() => null, zombie),
            null
        )
    })

    it("returns null when a successor replaced the expected player", () => {
        const zombie = { id: "a" }
        const successor = { id: "b" }
        assert.equal(
            getLivePlayerIfUnchanged(() => successor, zombie),
            null
        )
    })
})
