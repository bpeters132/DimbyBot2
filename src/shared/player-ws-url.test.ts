import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
    isLoopbackWsHost,
    playerWsFallbackProtocol,
    rewriteLocalDevPlayerWsUrl,
} from "./player-ws-url.js"

describe("rewriteLocalDevPlayerWsUrl", () => {
    it("downgrades wss://localhost to ws in development", () => {
        assert.equal(
            rewriteLocalDevPlayerWsUrl("wss://localhost:3001/ws", true),
            "ws://localhost:3001/ws"
        )
        assert.equal(
            rewriteLocalDevPlayerWsUrl("wss://127.0.0.1:3001/ws", true),
            "ws://127.0.0.1:3001/ws"
        )
    })

    it("leaves production and remote wss URLs unchanged", () => {
        assert.equal(
            rewriteLocalDevPlayerWsUrl("wss://localhost:3001/ws", false),
            "wss://localhost:3001/ws"
        )
        assert.equal(
            rewriteLocalDevPlayerWsUrl("wss://bot.example.com/ws", true),
            "wss://bot.example.com/ws"
        )
        assert.equal(
            rewriteLocalDevPlayerWsUrl("ws://localhost:3001/ws", true),
            "ws://localhost:3001/ws"
        )
    })
})

describe("playerWsFallbackProtocol", () => {
    it("uses ws for loopback in development even when the page is https", () => {
        assert.equal(
            playerWsFallbackProtocol({
                isDev: true,
                pageProtocol: "https:",
                hostname: "localhost",
            }),
            "ws"
        )
    })

    it("follows the page protocol outside local development", () => {
        assert.equal(
            playerWsFallbackProtocol({
                isDev: false,
                pageProtocol: "https:",
                hostname: "dashboard.example.com",
            }),
            "wss"
        )
        assert.equal(
            playerWsFallbackProtocol({
                isDev: true,
                pageProtocol: "http:",
                hostname: "localhost",
            }),
            "ws"
        )
        assert.equal(isLoopbackWsHost("LOCALHOST"), true)
    })
})
