import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { mapGuildsRouteAuthLookupFailure } from "@/lib/guilds-route-auth-failure.js"

describe("mapGuildsRouteAuthLookupFailure", () => {
    it("collapses 401 and 403 to Unauthorized", () => {
        assert.deepEqual(mapGuildsRouteAuthLookupFailure({ status: 401 }), {
            status: 401,
            body: { error: "Unauthorized" },
            lookupStatus: 401,
        })
        assert.deepEqual(mapGuildsRouteAuthLookupFailure({ status: 403 }), {
            status: 401,
            body: { error: "Unauthorized" },
            lookupStatus: 403,
        })
        assert.deepEqual(mapGuildsRouteAuthLookupFailure({ statusCode: 401 }), {
            status: 401,
            body: { error: "Unauthorized" },
            lookupStatus: 401,
        })
        assert.deepEqual(mapGuildsRouteAuthLookupFailure({ statusCode: 403 }), {
            status: 401,
            body: { error: "Unauthorized" },
            lookupStatus: 403,
        })
    })

    it("prefers numeric status over statusCode", () => {
        assert.equal(mapGuildsRouteAuthLookupFailure({ status: 401, statusCode: 500 }).status, 401)
        assert.equal(mapGuildsRouteAuthLookupFailure({ status: 500, statusCode: 401 }).status, 502)
        assert.equal(
            mapGuildsRouteAuthLookupFailure({ status: "401", statusCode: 403 }).status,
            401
        )
    })

    it("maps missing, retryable, and non-auth statuses to 502 without leaking the cause", () => {
        assert.deepEqual(mapGuildsRouteAuthLookupFailure(new Error("ECONNREFUSED")), {
            status: 502,
            body: { error: "Auth service unavailable" },
            lookupStatus: undefined,
        })
        assert.deepEqual(mapGuildsRouteAuthLookupFailure({ status: 500 }), {
            status: 502,
            body: { error: "Auth service unavailable" },
            lookupStatus: 500,
        })
        assert.deepEqual(mapGuildsRouteAuthLookupFailure({ status: 503 }), {
            status: 502,
            body: { error: "Auth service unavailable" },
            lookupStatus: 503,
        })
        assert.deepEqual(mapGuildsRouteAuthLookupFailure({ status: 429 }), {
            status: 502,
            body: { error: "Auth service unavailable" },
            lookupStatus: 429,
        })
        assert.deepEqual(mapGuildsRouteAuthLookupFailure(null), {
            status: 502,
            body: { error: "Auth service unavailable" },
            lookupStatus: undefined,
        })
        assert.deepEqual(mapGuildsRouteAuthLookupFailure({ status: "403" }), {
            status: 502,
            body: { error: "Auth service unavailable" },
            lookupStatus: undefined,
        })
    })
})
