import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
    readWsUpgradeTicket,
    resolveWsUpgradeAuth,
    type WsUpgradeAuthLookups,
} from "./wsUpgradeAuth.js"

function lookups(overrides: Partial<WsUpgradeAuthLookups> = {}): WsUpgradeAuthLookups {
    return {
        parseTicket: () => {
            throw new Error("parseTicket should not be called")
        },
        resolveDiscordUserId: async () => {
            throw new Error("resolveDiscordUserId should not be called")
        },
        getSessionUserId: async () => {
            throw new Error("getSessionUserId should not be called")
        },
        ...overrides,
    }
}

describe("readWsUpgradeTicket", () => {
    it("returns the ticket query param when a secret is configured", () => {
        assert.equal(readWsUpgradeTicket("/ws?ticket=abc", "secret"), "abc")
        assert.equal(readWsUpgradeTicket("/ws?ticket=abc&x=1", "secret"), "abc")
    })

    it("returns null when the secret is missing or the ticket is blank", () => {
        assert.equal(readWsUpgradeTicket("/ws?ticket=abc", undefined), null)
        assert.equal(readWsUpgradeTicket("/ws?ticket=abc", ""), null)
        assert.equal(readWsUpgradeTicket("/ws?ticket=", "secret"), null)
        assert.equal(readWsUpgradeTicket("/ws", "secret"), null)
    })

    it("returns null for a malformed upgrade URL instead of throwing", () => {
        assert.equal(readWsUpgradeTicket("http://[::1", "secret"), null)
    })
})

describe("resolveWsUpgradeAuth", () => {
    const secret = "ws-secret"
    const ticketUrl = "/ws?ticket=tok-1"

    it("authenticates a ticket that maps to a Discord snowflake without reading the session", async () => {
        const sessionCalls: number[] = []
        const result = await resolveWsUpgradeAuth(
            ticketUrl,
            secret,
            lookups({
                parseTicket: (ticket, usedSecret) => {
                    assert.equal(ticket, "tok-1")
                    assert.equal(usedSecret, secret)
                    return "better-auth-ticket"
                },
                resolveDiscordUserId: async (id) => {
                    assert.equal(id, "better-auth-ticket")
                    return "111111111111111111"
                },
                getSessionUserId: async () => {
                    sessionCalls.push(1)
                    return "session-user"
                },
            })
        )
        assert.deepEqual(result, { userId: "111111111111111111" })
        assert.deepEqual(sessionCalls, [])
    })

    it("prefers the ticket Discord id over a different cookie-session Discord id", async () => {
        const result = await resolveWsUpgradeAuth(
            ticketUrl,
            secret,
            lookups({
                parseTicket: () => "ticket-user",
                resolveDiscordUserId: async (id) =>
                    id === "ticket-user" ? "222222222222222222" : "333333333333333333",
                getSessionUserId: async () => "session-user",
            })
        )
        assert.deepEqual(result, { userId: "222222222222222222" })
    })

    it("falls through to the session when the ticket has no Discord link", async () => {
        const resolved: string[] = []
        const result = await resolveWsUpgradeAuth(
            ticketUrl,
            secret,
            lookups({
                parseTicket: () => "ticket-user",
                resolveDiscordUserId: async (id) => {
                    resolved.push(id)
                    return id === "session-user" ? "444444444444444444" : null
                },
                getSessionUserId: async () => "session-user",
            })
        )
        assert.deepEqual(resolved, ["ticket-user", "session-user"])
        assert.deepEqual(result, { userId: "444444444444444444" })
    })

    it("falls through to the session when the ticket is invalid or throws", async () => {
        const ticketErrors: unknown[] = []
        const invalid = await resolveWsUpgradeAuth(
            ticketUrl,
            secret,
            lookups({
                parseTicket: () => null,
                resolveDiscordUserId: async (id) => {
                    assert.equal(id, "session-user")
                    return "555555555555555555"
                },
                getSessionUserId: async () => "session-user",
            })
        )
        assert.deepEqual(invalid, { userId: "555555555555555555" })

        const threw = await resolveWsUpgradeAuth(
            ticketUrl,
            secret,
            lookups({
                parseTicket: () => {
                    throw new Error("bad hmac")
                },
                resolveDiscordUserId: async () => "555555555555555555",
                getSessionUserId: async () => "session-user",
                onTicketError: (error) => ticketErrors.push(error),
            })
        )
        assert.deepEqual(threw, { userId: "555555555555555555" })
        assert.equal(ticketErrors.length, 1)

        const discordErrors: unknown[] = []
        const ticketDiscordThrow = await resolveWsUpgradeAuth(
            ticketUrl,
            secret,
            lookups({
                parseTicket: () => "ticket-user",
                resolveDiscordUserId: async (id) => {
                    if (id === "ticket-user") throw new Error("ticket discord down")
                    return "555555555555555555"
                },
                getSessionUserId: async () => "session-user",
                onTicketError: (error) => ticketErrors.push(error),
                onDiscordError: (error) => discordErrors.push(error),
            })
        )
        assert.deepEqual(ticketDiscordThrow, { userId: "555555555555555555" })
        assert.equal(ticketErrors.length, 2)
        assert.deepEqual(discordErrors, [])
    })

    it("skips the ticket path when BETTER_AUTH_SECRET is unset", async () => {
        const result = await resolveWsUpgradeAuth(
            ticketUrl,
            undefined,
            lookups({
                getSessionUserId: async () => "session-user",
                resolveDiscordUserId: async (id) => {
                    assert.equal(id, "session-user")
                    return "666666666666666666"
                },
            })
        )
        assert.deepEqual(result, { userId: "666666666666666666" })
    })

    it("denies a cookie session that does not map to a Discord snowflake", async () => {
        const result = await resolveWsUpgradeAuth(
            "/ws",
            secret,
            lookups({
                getSessionUserId: async () => "session-user",
                resolveDiscordUserId: async () => null,
            })
        )
        assert.equal(result, null)
    })

    it("denies closed when session lookup throws", async () => {
        const sessionErrors: unknown[] = []
        const result = await resolveWsUpgradeAuth(
            "/ws",
            secret,
            lookups({
                getSessionUserId: async () => {
                    throw new Error("db down")
                },
                onSessionError: (error) => sessionErrors.push(error),
            })
        )
        assert.equal(result, null)
        assert.equal(sessionErrors.length, 1)
    })

    it("denies closed when session Discord resolve throws", async () => {
        const discordErrors: unknown[] = []
        const result = await resolveWsUpgradeAuth(
            "/ws",
            secret,
            lookups({
                getSessionUserId: async () => "session-user",
                resolveDiscordUserId: async () => {
                    throw new Error("discord down")
                },
                onDiscordError: (error) => discordErrors.push(error),
            })
        )
        assert.equal(result, null)
        assert.equal(discordErrors.length, 1)
    })

    it("denies when there is no ticket and no session user", async () => {
        const result = await resolveWsUpgradeAuth(
            "/ws",
            secret,
            lookups({
                getSessionUserId: async () => null,
            })
        )
        assert.equal(result, null)
    })
})
