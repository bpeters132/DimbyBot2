import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
    firstForwardedValue,
    requestProtocolFromForwarded,
    resolveAuthHostAlignment,
} from "@/lib/auth-host-alignment.js"

describe("firstForwardedValue", () => {
    it("takes the first comma-separated hop and trims it", () => {
        assert.equal(
            firstForwardedValue("dashboard.example, internal.example"),
            "dashboard.example"
        )
        assert.equal(firstForwardedValue("  app.example  "), "app.example")
    })

    it("treats missing, blank, and empty-first-hop values as absent", () => {
        assert.equal(firstForwardedValue(null), null)
        assert.equal(firstForwardedValue(undefined), null)
        assert.equal(firstForwardedValue(""), null)
        assert.equal(firstForwardedValue("   "), null)
        assert.equal(firstForwardedValue(",fallback.example"), null)
    })
})

describe("requestProtocolFromForwarded", () => {
    it("trusts only http/https from the first forwarded proto hop", () => {
        assert.equal(requestProtocolFromForwarded("https", "http:"), "https:")
        assert.equal(requestProtocolFromForwarded("http, https", "https:"), "http:")
        assert.equal(requestProtocolFromForwarded(" HTTPS ", "http:"), "https:")
    })

    it("falls back when proto is missing or not http(s)", () => {
        assert.equal(requestProtocolFromForwarded(null, "https:"), "https:")
        assert.equal(requestProtocolFromForwarded("ws", "https:"), "https:")
        assert.equal(requestProtocolFromForwarded("ftp", "http:"), "http:")
    })
})

describe("resolveAuthHostAlignment", () => {
    const base = {
        forwardedHost: null as string | null,
        hostHeader: "dashboard.example",
        fallbackHost: "localhost:3000",
        forwardedProto: null as string | null,
        fallbackProtocol: "https:",
    }

    it("skips when BETTER_AUTH_URL is unset or blank", () => {
        assert.equal(
            resolveAuthHostAlignment({ ...base, configuredUrl: undefined }).kind,
            "unconfigured"
        )
        assert.equal(
            resolveAuthHostAlignment({ ...base, configuredUrl: "   " }).kind,
            "unconfigured"
        )
    })

    it("flags an invalid BETTER_AUTH_URL instead of throwing", () => {
        assert.equal(
            resolveAuthHostAlignment({ ...base, configuredUrl: "not a url" }).kind,
            "invalid_config"
        )
    })

    it("aligns Host with BETTER_AUTH_URL after default-port stripping", () => {
        const aligned = resolveAuthHostAlignment({
            ...base,
            configuredUrl: "https://Dashboard.Example:443/app",
            hostHeader: "dashboard.example",
            fallbackProtocol: "https:",
        })
        assert.equal(aligned.kind, "aligned")
    })

    it("prefers x-forwarded-host over Host so reverse-proxy drift is the compared value", () => {
        const mismatch = resolveAuthHostAlignment({
            ...base,
            configuredUrl: "https://dashboard.example",
            forwardedHost: "www.dashboard.example, dashboard.example",
            hostHeader: "dashboard.example",
        })
        assert.equal(mismatch.kind, "mismatch")
        if (mismatch.kind !== "mismatch") return
        assert.equal(mismatch.normalizedHost, "www.dashboard.example")
        assert.equal(mismatch.normalizedExpectedHost, "dashboard.example")
    })

    it("uses x-forwarded-proto so https://host:443 matches a TLS-terminated request", () => {
        const aligned = resolveAuthHostAlignment({
            ...base,
            configuredUrl: "https://dashboard.example",
            hostHeader: "dashboard.example:443",
            forwardedProto: "https, http",
            fallbackProtocol: "http:",
        })
        assert.equal(aligned.kind, "aligned")
    })

    it("does not strip :443 when the request is treated as http", () => {
        const mismatch = resolveAuthHostAlignment({
            ...base,
            configuredUrl: "https://dashboard.example",
            hostHeader: "dashboard.example:443",
            forwardedProto: "http",
            fallbackProtocol: "https:",
        })
        assert.equal(mismatch.kind, "mismatch")
        if (mismatch.kind !== "mismatch") return
        assert.equal(mismatch.normalizedHost, "dashboard.example:443")
    })
})
