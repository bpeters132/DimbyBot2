import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { mapWsTicketAuthFailure } from "@/lib/ws-ticket-auth-failure.js"

describe("mapWsTicketAuthFailure", () => {
    it("maps a missing BETTER_AUTH_SECRET to 503 misconfigured, not Unauthorized", () => {
        assert.deepEqual(mapWsTicketAuthFailure("missing_secret"), {
            status: 503,
            body: { error: "Server misconfigured" },
        })
    })

    it("maps a resolved session without a user id to 401", () => {
        assert.deepEqual(mapWsTicketAuthFailure("unauthorized"), {
            status: 401,
            body: { error: "Unauthorized" },
        })
    })

    it("maps session lookup throws to 503 unavailable, not Unauthorized", () => {
        assert.deepEqual(mapWsTicketAuthFailure("auth_unavailable"), {
            status: 503,
            body: { error: "Auth service temporarily unavailable" },
        })
    })

    it("never returns 401 for server-side auth outages", () => {
        assert.notEqual(mapWsTicketAuthFailure("missing_secret").status, 401)
        assert.notEqual(mapWsTicketAuthFailure("auth_unavailable").status, 401)
        assert.equal(mapWsTicketAuthFailure("unauthorized").status, 401)
    })
})
