import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { guildWebPlayerPageUrl, webDashboardPromoAppend } from "./webDashboardUrl.js"

describe("guildWebPlayerPageUrl", () => {
    it("returns null when BETTER_AUTH_URL is missing, invalid, or non-http", () => {
        const prev = process.env.BETTER_AUTH_URL
        try {
            delete process.env.BETTER_AUTH_URL
            assert.equal(guildWebPlayerPageUrl("123"), null)

            process.env.BETTER_AUTH_URL = "   "
            assert.equal(guildWebPlayerPageUrl("123"), null)

            process.env.BETTER_AUTH_URL = "not a url"
            assert.equal(guildWebPlayerPageUrl("123"), null)

            process.env.BETTER_AUTH_URL = "ftp://dashboard.example.com"
            assert.equal(guildWebPlayerPageUrl("123"), null)
        } finally {
            if (prev === undefined) delete process.env.BETTER_AUTH_URL
            else process.env.BETTER_AUTH_URL = prev
        }
    })

    it("builds /dashboard/<guildId> from the public origin and encodes the id", () => {
        const prev = process.env.BETTER_AUTH_URL
        try {
            process.env.BETTER_AUTH_URL = "https://dash.example.com/"
            assert.equal(
                guildWebPlayerPageUrl("987654321"),
                "https://dash.example.com/dashboard/987654321"
            )

            process.env.BETTER_AUTH_URL = "http://localhost:3000///"
            assert.equal(
                guildWebPlayerPageUrl("guild/with spaces"),
                "http://localhost:3000/dashboard/guild%2Fwith%20spaces"
            )

            // Path on BETTER_AUTH_URL is ignored; only origin is used.
            process.env.BETTER_AUTH_URL = "https://dash.example.com/auth/callback"
            assert.equal(
                guildWebPlayerPageUrl("1"),
                "https://dash.example.com/dashboard/1"
            )
        } finally {
            if (prev === undefined) delete process.env.BETTER_AUTH_URL
            else process.env.BETTER_AUTH_URL = prev
        }
    })
})

describe("webDashboardPromoAppend", () => {
    it("returns empty string without a resolvable dashboard URL", () => {
        const prev = process.env.BETTER_AUTH_URL
        try {
            delete process.env.BETTER_AUTH_URL
            assert.equal(webDashboardPromoAppend("1"), "")
        } finally {
            if (prev === undefined) delete process.env.BETTER_AUTH_URL
            else process.env.BETTER_AUTH_URL = prev
        }
    })

    it("appends a markdown dashboard link when BETTER_AUTH_URL is set", () => {
        const prev = process.env.BETTER_AUTH_URL
        try {
            process.env.BETTER_AUTH_URL = "https://dash.example.com"
            const text = webDashboardPromoAppend("42")
            assert.match(text, /^\n\n\*\*Web player:\*\*/)
            assert.match(text, /\[dashboard\]\(https:\/\/dash\.example\.com\/dashboard\/42\)/)
        } finally {
            if (prev === undefined) delete process.env.BETTER_AUTH_URL
            else process.env.BETTER_AUTH_URL = prev
        }
    })
})
