import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { resolveControlIdlePlayReconnect } from "./controlIdlePlayReconnect.js"

describe("resolveControlIdlePlayReconnect", () => {
    it("plays immediately when the player is already connected", () => {
        assert.equal(
            resolveControlIdlePlayReconnect({
                playerConnected: true,
                playerVoiceChannelId: "vc-bot",
                memberVoiceChannelId: "vc-other",
            }),
            "play"
        )
        assert.equal(
            resolveControlIdlePlayReconnect({
                playerConnected: true,
                playerVoiceChannelId: null,
                memberVoiceChannelId: null,
            }),
            "play"
        )
    })

    it("reconnects only when disconnected and the member matches the player voice channel", () => {
        assert.equal(
            resolveControlIdlePlayReconnect({
                playerConnected: false,
                playerVoiceChannelId: "vc-a",
                memberVoiceChannelId: "vc-a",
            }),
            "reconnect"
        )
    })

    it("refuses reconnect when disconnected and the member is elsewhere or missing", () => {
        assert.equal(
            resolveControlIdlePlayReconnect({
                playerConnected: false,
                playerVoiceChannelId: "vc-a",
                memberVoiceChannelId: "vc-b",
            }),
            "refuse"
        )
        assert.equal(
            resolveControlIdlePlayReconnect({
                playerConnected: false,
                playerVoiceChannelId: "vc-a",
                memberVoiceChannelId: null,
            }),
            "refuse"
        )
        assert.equal(
            resolveControlIdlePlayReconnect({
                playerConnected: false,
                playerVoiceChannelId: "vc-a",
                memberVoiceChannelId: undefined,
            }),
            "refuse"
        )
    })

    it("refuses reconnect when the player has no bound voice channel", () => {
        assert.equal(
            resolveControlIdlePlayReconnect({
                playerConnected: false,
                playerVoiceChannelId: null,
                memberVoiceChannelId: "vc-a",
            }),
            "refuse"
        )
        assert.equal(
            resolveControlIdlePlayReconnect({
                playerConnected: false,
                playerVoiceChannelId: undefined,
                memberVoiceChannelId: "vc-a",
            }),
            "refuse"
        )
        assert.equal(
            resolveControlIdlePlayReconnect({
                playerConnected: false,
                playerVoiceChannelId: "",
                memberVoiceChannelId: "",
            }),
            "refuse"
        )
    })
})
