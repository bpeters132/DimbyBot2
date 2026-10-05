import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
    forceUnsubscribeErrorFrame,
    forceUnsubscribeUnsubscribedFrame,
    mapWsCanViewPlayer,
    subscribeDenialErrorFrame,
    WS_FORCE_UNSUBSCRIBE_MESSAGE,
    type WsViewPlayerDenialCode,
} from "../../../src/shared/websocket/wsCanViewPlayer.js"

const DENIAL_CODES: readonly WsViewPlayerDenialCode[] = [
    "BOT_UNAVAILABLE",
    "SUBSCRIBE_FORBIDDEN",
    "PERMISSION_RESOLUTION_ERROR",
]

describe("mapWsCanViewPlayer", () => {
    it("returns BOT_UNAVAILABLE when the bot is not ready, even if permissions also failed", () => {
        assert.deepEqual(
            mapWsCanViewPlayer({
                botReady: false,
                permissionResolutionFailed: true,
                hasViewPlayer: false,
            }),
            { allowed: false, code: "BOT_UNAVAILABLE" }
        )
        assert.deepEqual(
            mapWsCanViewPlayer({
                botReady: false,
                permissionResolutionFailed: false,
                hasViewPlayer: true,
            }),
            { allowed: false, code: "BOT_UNAVAILABLE" }
        )
    })

    it("returns PERMISSION_RESOLUTION_ERROR on a failed lookup, not SUBSCRIBE_FORBIDDEN", () => {
        assert.deepEqual(
            mapWsCanViewPlayer({
                botReady: true,
                permissionResolutionFailed: true,
                hasViewPlayer: false,
            }),
            { allowed: false, code: "PERMISSION_RESOLUTION_ERROR" }
        )
        assert.deepEqual(
            mapWsCanViewPlayer({
                botReady: true,
                permissionResolutionFailed: true,
                hasViewPlayer: true,
            }),
            { allowed: false, code: "PERMISSION_RESOLUTION_ERROR" }
        )
    })

    it("returns SUBSCRIBE_FORBIDDEN when resolution succeeded but VIEW_PLAYER is missing", () => {
        assert.deepEqual(
            mapWsCanViewPlayer({
                botReady: true,
                permissionResolutionFailed: false,
                hasViewPlayer: false,
            }),
            { allowed: false, code: "SUBSCRIBE_FORBIDDEN" }
        )
    })

    it("allows the socket when the bot is ready and VIEW_PLAYER is present", () => {
        assert.deepEqual(
            mapWsCanViewPlayer({
                botReady: true,
                permissionResolutionFailed: false,
                hasViewPlayer: true,
            }),
            { allowed: true }
        )
    })
})

describe("forceUnsubscribeErrorFrame", () => {
    it("uses the same access-changed copy for every denial code", () => {
        for (const code of DENIAL_CODES) {
            assert.deepEqual(forceUnsubscribeErrorFrame(code), {
                type: "error",
                code,
                message: WS_FORCE_UNSUBSCRIBE_MESSAGE,
            })
        }
    })

    it("pairs the error frame with an unsubscribed frame for the same guild", () => {
        assert.deepEqual(forceUnsubscribeUnsubscribedFrame("guild-1"), {
            type: "unsubscribed",
            guildId: "guild-1",
        })
    })
})

describe("subscribeDenialErrorFrame", () => {
    it("keeps bot-unavailable copy distinct from force-unsubscribe access-changed copy", () => {
        const frame = subscribeDenialErrorFrame("BOT_UNAVAILABLE")
        assert.equal(frame.type, "error")
        assert.equal(frame.code, "BOT_UNAVAILABLE")
        assert.equal(
            frame.message,
            "Live updates require the bot process to be running with this dashboard."
        )
        assert.notEqual(frame.message, WS_FORCE_UNSUBSCRIBE_MESSAGE)
    })

    it("keeps permission-resolution copy as a retryable lookup failure, not forbidden", () => {
        const frame = subscribeDenialErrorFrame("PERMISSION_RESOLUTION_ERROR")
        assert.equal(frame.code, "PERMISSION_RESOLUTION_ERROR")
        assert.equal(frame.message, "Could not resolve permissions for this subscription request.")
        assert.notEqual(frame.message, WS_FORCE_UNSUBSCRIBE_MESSAGE)
        assert.match(frame.message, /could not resolve permissions/i)
        assert.doesNotMatch(frame.message, /blocked/i)
    })

    it("explains SUBSCRIBE_FORBIDDEN as access verification, not voice or playback", () => {
        const frame = subscribeDenialErrorFrame("SUBSCRIBE_FORBIDDEN")
        assert.equal(frame.code, "SUBSCRIBE_FORBIDDEN")
        assert.equal(
            frame.message,
            "Live updates are blocked: the bot could not verify your access to this server’s player (sign in with Discord, same account as in the server). This is not about voice channels or whether music is playing."
        )
        assert.notEqual(frame.message, WS_FORCE_UNSUBSCRIBE_MESSAGE)
        assert.match(frame.message, /not about voice channels/i)
    })

    it("never reuses force-unsubscribe copy for subscribe-time denials", () => {
        for (const code of DENIAL_CODES) {
            assert.notEqual(
                subscribeDenialErrorFrame(code).message,
                forceUnsubscribeErrorFrame(code).message
            )
        }
    })
})
