import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
    readBotApiProxyTimeoutMs,
    resolveFetchTimeoutMs,
} from "../web/lib/bot-api-timeout.js"

describe("resolveFetchTimeoutMs", () => {
    it("defaults missing and non-finite values to 10s", () => {
        assert.equal(resolveFetchTimeoutMs(), 10_000)
        assert.equal(resolveFetchTimeoutMs(Number.NaN), 10_000)
        assert.equal(resolveFetchTimeoutMs(Number.POSITIVE_INFINITY), 10_000)
    })

    it("floors fractional values and clamps to 1s…5m", () => {
        assert.equal(resolveFetchTimeoutMs(1500.9), 1500)
        assert.equal(resolveFetchTimeoutMs(0), 1_000)
        assert.equal(resolveFetchTimeoutMs(-50), 1_000)
        assert.equal(resolveFetchTimeoutMs(999_999), 300_000)
    })
})

describe("readBotApiProxyTimeoutMs", () => {
    it("defaults missing/blank/invalid env values to 4s", () => {
        assert.equal(readBotApiProxyTimeoutMs(undefined), 4_000)
        assert.equal(readBotApiProxyTimeoutMs(""), 4_000)
        assert.equal(readBotApiProxyTimeoutMs("   "), 4_000)
        assert.equal(readBotApiProxyTimeoutMs("nope"), 4_000)
        assert.equal(readBotApiProxyTimeoutMs("1.5"), 1_000)
    })

    it("clamps parsed integers to 1s…2m", () => {
        assert.equal(readBotApiProxyTimeoutMs("500"), 1_000)
        assert.equal(readBotApiProxyTimeoutMs("8000"), 8_000)
        assert.equal(readBotApiProxyTimeoutMs("999999"), 120_000)
        assert.equal(readBotApiProxyTimeoutMs(" 2500 "), 2_500)
    })
})
