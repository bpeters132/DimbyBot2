import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { parseWsClientMessage } from "../../../src/shared/websocket/wsClientMessage.js"

describe("parseWsClientMessage", () => {
    it("accepts ping frames", () => {
        assert.deepEqual(parseWsClientMessage(JSON.stringify({ type: "ping" })), { kind: "ping" })
        assert.deepEqual(parseWsClientMessage(JSON.stringify({ type: "ping", extra: true })), {
            kind: "ping",
        })
    })

    it("accepts subscribe and unsubscribe with a non-empty string guildId", () => {
        assert.deepEqual(
            parseWsClientMessage(JSON.stringify({ type: "subscribe", guildId: "123" })),
            { kind: "subscribe", guildId: "123" }
        )
        assert.deepEqual(
            parseWsClientMessage(JSON.stringify({ type: "unsubscribe", guildId: "123" })),
            { kind: "unsubscribe", guildId: "123" }
        )
        // Current contract: whitespace-only guildId is a non-empty string and is accepted.
        assert.deepEqual(
            parseWsClientMessage(JSON.stringify({ type: "subscribe", guildId: "  " })),
            { kind: "subscribe", guildId: "  " }
        )
    })

    it("rejects missing, empty, or non-string guildId on subscribe and unsubscribe", () => {
        assert.deepEqual(parseWsClientMessage(JSON.stringify({ type: "subscribe" })), {
            kind: "error",
            message: "Invalid guildId for subscribe.",
        })
        assert.deepEqual(parseWsClientMessage(JSON.stringify({ type: "subscribe", guildId: "" })), {
            kind: "error",
            message: "Invalid guildId for subscribe.",
        })
        assert.deepEqual(parseWsClientMessage(JSON.stringify({ type: "subscribe", guildId: 99 })), {
            kind: "error",
            message: "Invalid guildId for subscribe.",
        })
        assert.deepEqual(parseWsClientMessage(JSON.stringify({ type: "unsubscribe" })), {
            kind: "error",
            message: "Invalid guildId for unsubscribe.",
        })
        assert.deepEqual(
            parseWsClientMessage(JSON.stringify({ type: "unsubscribe", guildId: null })),
            {
                kind: "error",
                message: "Invalid guildId for unsubscribe.",
            }
        )
    })

    it("rejects invalid JSON and non-object payloads as invalid message JSON", () => {
        assert.deepEqual(parseWsClientMessage("not-json"), {
            kind: "error",
            message: "Invalid message JSON.",
        })
        assert.deepEqual(parseWsClientMessage("null"), {
            kind: "error",
            message: "Invalid message JSON.",
        })
        assert.deepEqual(parseWsClientMessage("[]"), {
            kind: "error",
            message: "Invalid message JSON.",
        })
        assert.deepEqual(parseWsClientMessage('"hello"'), {
            kind: "error",
            message: "Invalid message JSON.",
        })
        assert.deepEqual(parseWsClientMessage("1"), {
            kind: "error",
            message: "Invalid message JSON.",
        })
    })

    it("ignores unknown message types instead of sending an error frame", () => {
        assert.deepEqual(parseWsClientMessage(JSON.stringify({ type: "pong" })), { kind: "ignore" })
        assert.deepEqual(parseWsClientMessage(JSON.stringify({ type: "subscribe_all" })), {
            kind: "ignore",
        })
        assert.deepEqual(parseWsClientMessage(JSON.stringify({})), { kind: "ignore" })
    })
})
