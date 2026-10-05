import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
    isLoopbackWsHost,
    playerWsFallbackProtocol,
    resolvePublicPlayerWsConfigUrl,
    rewriteLocalDevPlayerWsUrl,
} from "../../src/shared/player-ws-url.js"

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

describe("resolvePublicPlayerWsConfigUrl", () => {
    it("uses a localhost fallback in development when no URL is configured", () => {
        assert.equal(
            resolvePublicPlayerWsConfigUrl({
                configuredUrl: "",
                isDev: true,
                devFallbackPort: 3001,
            }),
            "ws://localhost:3001/ws"
        )
        assert.equal(
            resolvePublicPlayerWsConfigUrl({
                configuredUrl: "   ",
                isDev: true,
                devFallbackPort: 8080,
            }),
            "ws://localhost:8080/ws"
        )
    })

    it("returns null in production when no URL is configured", () => {
        assert.equal(
            resolvePublicPlayerWsConfigUrl({
                configuredUrl: "",
                isDev: false,
                devFallbackPort: 3001,
            }),
            null
        )
    })

    it("accepts wss URLs and allows plaintext ws only in development", () => {
        assert.equal(
            resolvePublicPlayerWsConfigUrl({
                configuredUrl: "wss://bot.example.com/ws",
                isDev: false,
                devFallbackPort: 3001,
            }),
            "wss://bot.example.com/ws"
        )
        assert.equal(
            resolvePublicPlayerWsConfigUrl({
                configuredUrl: "ws://bot.example.com/ws",
                isDev: true,
                devFallbackPort: 3001,
            }),
            "ws://bot.example.com/ws"
        )
        assert.equal(
            resolvePublicPlayerWsConfigUrl({
                configuredUrl: "ws://bot.example.com/ws",
                isDev: false,
                devFallbackPort: 3001,
            }),
            null
        )
    })

    it("rejects credentials, non-ws schemes, and invalid URLs", () => {
        assert.equal(
            resolvePublicPlayerWsConfigUrl({
                configuredUrl: "wss://user:pass@bot.example.com/ws",
                isDev: false,
                devFallbackPort: 3001,
            }),
            null
        )
        assert.equal(
            resolvePublicPlayerWsConfigUrl({
                configuredUrl: "wss://user@bot.example.com/ws",
                isDev: false,
                devFallbackPort: 3001,
            }),
            null
        )
        assert.equal(
            resolvePublicPlayerWsConfigUrl({
                configuredUrl: "https://bot.example.com/ws",
                isDev: false,
                devFallbackPort: 3001,
            }),
            null
        )
        assert.equal(
            resolvePublicPlayerWsConfigUrl({
                configuredUrl: "http://bot.example.com/ws",
                isDev: true,
                devFallbackPort: 3001,
            }),
            null
        )
        assert.equal(
            resolvePublicPlayerWsConfigUrl({
                configuredUrl: "not a url",
                isDev: true,
                devFallbackPort: 3001,
            }),
            null
        )
    })

    it("downgrades wss://localhost in development via rewriteLocalDevPlayerWsUrl", () => {
        assert.equal(
            resolvePublicPlayerWsConfigUrl({
                configuredUrl: "wss://localhost:3001/ws",
                isDev: true,
                devFallbackPort: 3001,
            }),
            "ws://localhost:3001/ws"
        )
    })
})
