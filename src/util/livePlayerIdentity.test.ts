import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
    getLivePlayerIfUnchanged,
    isExpectedPlayerMoveConfirm,
    isExpectedPlayerUpdateConfirm,
    isSameLivePlayer,
} from "./livePlayerIdentity.js"

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

describe("isExpectedPlayerMoveConfirm", () => {
    it("accepts the expected player moving into the target channel", () => {
        const player = { id: "p1" }
        assert.equal(isExpectedPlayerMoveConfirm(player, player, "vc-1", "vc-1"), true)
    })

    it("rejects a successor instance or wrong channel", () => {
        const expected = { id: "p1" }
        const successor = { id: "p1" }
        assert.equal(isExpectedPlayerMoveConfirm(successor, expected, "vc-1", "vc-1"), false)
        assert.equal(isExpectedPlayerMoveConfirm(expected, expected, "vc-other", "vc-1"), false)
        assert.equal(isExpectedPlayerMoveConfirm(expected, expected, null, "vc-1"), false)
    })
})

describe("isExpectedPlayerUpdateConfirm", () => {
    it("accepts the expected player when connected in the target channel", () => {
        const player = { connected: true, voiceChannelId: "vc-1" }
        assert.equal(isExpectedPlayerUpdateConfirm(player, player, "vc-1"), true)
    })

    it("rejects successor, disconnected, or wrong-channel updates", () => {
        const expected = { connected: true, voiceChannelId: "vc-1" }
        const successor = { connected: true, voiceChannelId: "vc-1" }
        assert.equal(isExpectedPlayerUpdateConfirm(successor, expected, "vc-1"), false)

        const disconnected = { connected: false, voiceChannelId: "vc-1" }
        assert.equal(isExpectedPlayerUpdateConfirm(disconnected, disconnected, "vc-1"), false)

        const wrongChannel = { connected: true, voiceChannelId: "vc-other" }
        assert.equal(isExpectedPlayerUpdateConfirm(wrongChannel, wrongChannel, "vc-1"), false)
    })
})
