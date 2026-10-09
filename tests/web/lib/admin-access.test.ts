import assert from "node:assert/strict"
import { beforeEach, describe, it, mock } from "node:test"

const OWNER = "100000000000000001"
const OTHER = "100000000000000002"

const session = {
    user: { id: "user_internal_cuid", name: "Ada" },
    session: { id: "s", expiresAt: "2099-01-01" },
}

const state = {
    session: session as typeof session | null,
    sessionThrows: false,
    discordUserId: OWNER as string | null,
    discordThrows: false,
    ownerId: OWNER as string | null,
    headersThrows: false,
}

mock.module("next/headers", {
    namedExports: {
        headers: async () => {
            if (state.headersThrows) throw new Error("headers unavailable")
            return new Headers()
        },
    },
})

mock.module("@/auth", {
    namedExports: {
        auth: {
            api: {
                getSession: async () => {
                    if (state.sessionThrows) throw new Error("auth down")
                    return state.session
                },
            },
        },
    },
})

mock.module("@/shared/discord-user-id", {
    namedExports: {
        resolveDiscordUserSnowflake: async () => {
            if (state.discordThrows) throw new Error("discord resolve exploded")
            return state.discordUserId
        },
    },
})

mock.module("@/shared/permissions", {
    namedExports: {
        getCachedOwnerId: () => state.ownerId,
    },
})

const { resolveAdminAccess, canAccessAdmin, guardAdminAccess } =
    await import("../../../src/web/lib/admin-access.js")

describe("resolveAdminAccess", () => {
    beforeEach(() => {
        state.session = session
        state.sessionThrows = false
        state.discordUserId = OWNER
        state.discordThrows = false
        state.ownerId = OWNER
        state.headersThrows = false
    })

    it("returns 503 when getSession throws", async () => {
        state.sessionThrows = true
        const result = await resolveAdminAccess(new Headers())
        assert.equal(result.ok, false)
        if (result.ok) return
        assert.equal(result.status, 503)
        assert.equal(result.error, "Service Unavailable")
    })

    it("returns 401 without a session user", async () => {
        state.session = null
        const result = await resolveAdminAccess(new Headers())
        assert.equal(result.ok, false)
        if (result.ok) return
        assert.equal(result.status, 401)
        assert.equal(result.error, "Unauthorized")
    })

    it("returns 403 when Discord resolution throws", async () => {
        state.discordThrows = true
        const result = await resolveAdminAccess(new Headers())
        assert.equal(result.ok, false)
        if (result.ok) return
        assert.equal(result.status, 403)
        assert.equal(result.error, "Discord account required")
    })

    it("returns 403 when Discord resolution yields no snowflake", async () => {
        state.discordUserId = null
        const result = await resolveAdminAccess(new Headers())
        assert.equal(result.ok, false)
        if (result.ok) return
        assert.equal(result.status, 403)
        assert.equal(result.error, "Discord account required")
    })

    it("returns 403 when the caller is not the owner", async () => {
        state.discordUserId = OTHER
        const result = await resolveAdminAccess(new Headers())
        assert.equal(result.ok, false)
        if (result.ok) return
        assert.equal(result.status, 403)
        assert.equal(result.error, "Forbidden")
    })

    it("allows the owner and attaches the session", async () => {
        const result = await resolveAdminAccess(new Headers())
        assert.equal(result.ok, true)
        if (!result.ok) return
        assert.equal(result.discordUserId, OWNER)
        assert.equal(result.session.user.id, session.user.id)
    })
})

describe("guardAdminAccess", () => {
    beforeEach(() => {
        state.session = session
        state.sessionThrows = false
        state.discordUserId = OWNER
        state.discordThrows = false
        state.ownerId = OWNER
        state.headersThrows = false
    })

    it("returns null when the owner may proceed", async () => {
        const denied = await guardAdminAccess()
        assert.equal(denied, null)
    })

    it("returns the access denial status", async () => {
        state.session = null
        const denied = await guardAdminAccess()
        assert.notEqual(denied, null)
        assert.equal(denied?.status, 401)
        const body = await denied?.json()
        assert.equal(body.error, "Unauthorized")
    })

    it("returns 500 INTERNAL_ERROR when access lookup throws unexpectedly", async () => {
        state.headersThrows = true
        const denied = await guardAdminAccess()
        assert.notEqual(denied, null)
        assert.equal(denied?.status, 500)
        const body = await denied?.json()
        assert.equal(body.error, "Internal error")
        assert.deepEqual(body.details, { code: "INTERNAL_ERROR" })
    })
})

describe("canAccessAdmin", () => {
    beforeEach(() => {
        state.session = session
        state.sessionThrows = false
        state.discordUserId = OWNER
        state.discordThrows = false
        state.ownerId = OWNER
        state.headersThrows = false
    })

    it("returns true for the owner", async () => {
        assert.equal(await canAccessAdmin(), true)
    })

    it("returns false when access is denied", async () => {
        state.discordUserId = OTHER
        assert.equal(await canAccessAdmin(), false)
    })

    it("returns false when headers lookup throws", async () => {
        state.headersThrows = true
        assert.equal(await canAccessAdmin(), false)
    })
})
