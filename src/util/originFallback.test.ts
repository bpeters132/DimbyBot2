import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { getOriginFallback } from "../web/server/origin-fallback.js"

describe("getOriginFallback", () => {
    it("returns the BETTER_AUTH_URL origin when set to a valid http(s) URL", () => {
        const prev = process.env.BETTER_AUTH_URL
        try {
            process.env.BETTER_AUTH_URL = "https://dashboard.example/app"
            assert.equal(getOriginFallback(), "https://dashboard.example")

            process.env.BETTER_AUTH_URL = " http://localhost:3000/ "
            assert.equal(getOriginFallback(), "http://localhost:3000")
        } finally {
            if (prev === undefined) delete process.env.BETTER_AUTH_URL
            else process.env.BETTER_AUTH_URL = prev
        }
    })

    it("returns null when unset or not a valid URL", () => {
        const prev = process.env.BETTER_AUTH_URL
        try {
            delete process.env.BETTER_AUTH_URL
            assert.equal(getOriginFallback(), null)

            process.env.BETTER_AUTH_URL = "   "
            assert.equal(getOriginFallback(), null)

            process.env.BETTER_AUTH_URL = "not a url"
            assert.equal(getOriginFallback(), null)
        } finally {
            if (prev === undefined) delete process.env.BETTER_AUTH_URL
            else process.env.BETTER_AUTH_URL = prev
        }
    })
})
