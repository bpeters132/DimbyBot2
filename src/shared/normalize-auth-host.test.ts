import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { normalizeAuthHost } from "./normalize-auth-host.js"

describe("normalizeAuthHost", () => {
    it("lowercases hosts and strips matching default ports", () => {
        assert.equal(normalizeAuthHost("Dashboard.Example.com", "https:"), "dashboard.example.com")
        assert.equal(
            normalizeAuthHost("dashboard.example.com:443", "https:"),
            "dashboard.example.com"
        )
        assert.equal(normalizeAuthHost("localhost:80", "http:"), "localhost")
    })

    it("keeps non-default ports and does not strip the wrong scheme's default", () => {
        assert.equal(normalizeAuthHost("example.com:8443", "https:"), "example.com:8443")
        assert.equal(normalizeAuthHost("example.com:443", "http:"), "example.com:443")
        assert.equal(normalizeAuthHost("example.com:80", "https:"), "example.com:80")
    })

    it("parses absolute http(s) hosts and prefers the URL scheme for port stripping", () => {
        assert.equal(normalizeAuthHost("https://Example.com:443/path", "http:"), "example.com")
        assert.equal(normalizeAuthHost("http://localhost:80", "https:"), "localhost")
        assert.equal(normalizeAuthHost("  HTTPS://APP.EXAMPLE.COM  ", "http:"), "app.example.com")
    })
})
