import assert from "node:assert/strict"
import { beforeEach, describe, it, mock } from "node:test"

const ACCOUNT_SNOWFLAKE = "123456789012345678"
const ME_SNOWFLAKE = "234567890123456789"
const INTERNAL_USER_ID = "user_internal_cuid"

const state = {
    accounts: [] as { id?: string; providerId: string; accountId: string }[],
    dbThrows: false as boolean | Error,
    accessToken: { accessToken: "tok" } as unknown,
    accessTokenThrows: false,
    meId: ME_SNOWFLAKE as string | null,
    meCalls: 0,
    meToken: null as string | null,
    tokenCalls: 0,
    tokenBody: null as { accountId?: string } | null,
}

function resetState() {
    state.accounts = []
    state.dbThrows = false
    state.accessToken = { accessToken: "tok" }
    state.accessTokenThrows = false
    state.meId = ME_SNOWFLAKE
    state.meCalls = 0
    state.meToken = null
    state.tokenCalls = 0
    state.tokenBody = null
}

mock.module("../../src/lib/webPrisma.js", {
    namedExports: {
        getWebPrismaClient: () => ({
            account: {
                findMany: async () => {
                    if (state.dbThrows) {
                        throw state.dbThrows === true
                            ? Object.assign(new Error("Can't reach database server"), {
                                  code: "P1001",
                              })
                            : state.dbThrows
                    }
                    return state.accounts
                },
            },
        }),
    },
})

mock.module("../../src/shared/auth-node.js", {
    namedExports: {
        auth: {
            api: {
                getAccessToken: async (args: { body?: { accountId?: string } }) => {
                    state.tokenCalls += 1
                    state.tokenBody = args?.body ?? null
                    if (state.accessTokenThrows) {
                        throw new Error("token lookup failed")
                    }
                    return state.accessToken
                },
            },
        },
    },
})

mock.module("../../src/shared/discord-rest.js", {
    namedExports: {
        fetchDiscordCurrentUserId: async (accessToken: string) => {
            state.meCalls += 1
            state.meToken = accessToken
            return state.meId
        },
    },
})

const {
    isDiscordSnowflake,
    parseDashboardGuildId,
    getDiscordAccountSnowflake,
    getDiscordBetterAuthAccountId,
    resolveDiscordUserSnowflake,
} = await import("../../src/shared/discord-user-id.js")

describe("isDiscordSnowflake", () => {
    it("accepts typical Discord snowflakes after trim", () => {
        assert.equal(isDiscordSnowflake("12345678901234567"), true) // 17
        assert.equal(isDiscordSnowflake("123456789012345678"), true) // 18
        assert.equal(isDiscordSnowflake("1234567890123456789"), true) // 19
        assert.equal(isDiscordSnowflake("1234567890123456789012"), true) // 22
        assert.equal(isDiscordSnowflake("  123456789012345678  "), true)
    })

    it("rejects too-short, too-long, non-digit, and empty values", () => {
        assert.equal(isDiscordSnowflake("1234567890123456"), false) // 16
        assert.equal(isDiscordSnowflake("12345678901234567890123"), false) // 23
        assert.equal(isDiscordSnowflake("12345678901234567a"), false)
        assert.equal(isDiscordSnowflake("not-a-snowflake"), false)
        assert.equal(isDiscordSnowflake(""), false)
        assert.equal(isDiscordSnowflake("   "), false)
    })
})

describe("parseDashboardGuildId", () => {
    it("returns a trimmed snowflake for dashboard permission snapshot args", () => {
        assert.equal(parseDashboardGuildId("123456789012345678"), "123456789012345678")
        assert.equal(parseDashboardGuildId("  123456789012345678  "), "123456789012345678")
    })

    it("rejects non-strings, blanks, and non-snowflakes so snapshots fail closed", () => {
        assert.equal(parseDashboardGuildId(null), null)
        assert.equal(parseDashboardGuildId(undefined), null)
        assert.equal(parseDashboardGuildId(123456789012345678), null)
        assert.equal(parseDashboardGuildId(""), null)
        assert.equal(parseDashboardGuildId("   "), null)
        assert.equal(parseDashboardGuildId("not-a-guild"), null)
        assert.equal(parseDashboardGuildId("1234567890123456"), null)
        assert.equal(parseDashboardGuildId(["123456789012345678"]), null)
    })
})

describe("getDiscordAccountSnowflake", () => {
    beforeEach(() => {
        resetState()
    })

    it("returns the trimmed Discord accountId snowflake", async () => {
        state.accounts = [{ providerId: "discord", accountId: `  ${ACCOUNT_SNOWFLAKE}  ` }]
        assert.equal(await getDiscordAccountSnowflake(INTERNAL_USER_ID), ACCOUNT_SNOWFLAKE)
    })

    it("matches providerId case-insensitively", async () => {
        state.accounts = [
            { providerId: "google", accountId: "not-discord" },
            { providerId: "Discord", accountId: ACCOUNT_SNOWFLAKE },
        ]
        assert.equal(await getDiscordAccountSnowflake(INTERNAL_USER_ID), ACCOUNT_SNOWFLAKE)
    })

    it("returns null when the Discord accountId is not a snowflake", async () => {
        state.accounts = [{ providerId: "discord", accountId: "not-a-snowflake" }]
        assert.equal(await getDiscordAccountSnowflake(INTERNAL_USER_ID), null)
    })

    it("returns null when no Discord provider row exists", async () => {
        state.accounts = [{ providerId: "google", accountId: ACCOUNT_SNOWFLAKE }]
        assert.equal(await getDiscordAccountSnowflake(INTERNAL_USER_ID), null)
    })

    it("returns null when the account lookup throws", async () => {
        state.dbThrows = true
        assert.equal(await getDiscordAccountSnowflake(INTERNAL_USER_ID), null)
    })
})

describe("getDiscordBetterAuthAccountId", () => {
    beforeEach(() => {
        resetState()
    })

    it("returns the Discord account row id, not the provider name", async () => {
        state.accounts = [
            { id: "acct_google", providerId: "google", accountId: "g" },
            { id: "  acct_discord  ", providerId: "Discord", accountId: "not-a-snowflake" },
        ]
        assert.equal(await getDiscordBetterAuthAccountId(INTERNAL_USER_ID), "acct_discord")
    })

    it("returns null when no Discord row or id is present", async () => {
        state.accounts = [{ providerId: "discord", accountId: ACCOUNT_SNOWFLAKE }]
        assert.equal(await getDiscordBetterAuthAccountId(INTERNAL_USER_ID), null)
        state.accounts = [{ id: "acct_google", providerId: "google", accountId: "g" }]
        assert.equal(await getDiscordBetterAuthAccountId(INTERNAL_USER_ID), null)
    })
})

describe("resolveDiscordUserSnowflake", () => {
    beforeEach(() => {
        resetState()
    })

    it("prefers the DB account snowflake and skips the @me fallback", async () => {
        state.accounts = [{ providerId: "discord", accountId: ACCOUNT_SNOWFLAKE }]
        const id = await resolveDiscordUserSnowflake(INTERNAL_USER_ID, new Headers())
        assert.equal(id, ACCOUNT_SNOWFLAKE)
        assert.equal(state.tokenCalls, 0)
        assert.equal(state.meCalls, 0)
    })

    it("uses a snowflake Better Auth user.id when the DB row is missing", async () => {
        const id = await resolveDiscordUserSnowflake(`  ${ACCOUNT_SNOWFLAKE}  `, new Headers())
        assert.equal(id, ACCOUNT_SNOWFLAKE)
        assert.equal(state.tokenCalls, 0)
        assert.equal(state.meCalls, 0)
    })

    it("uses a snowflake Better Auth user.id when the account lookup throws", async () => {
        state.dbThrows = true
        const id = await resolveDiscordUserSnowflake(ACCOUNT_SNOWFLAKE, new Headers())
        assert.equal(id, ACCOUNT_SNOWFLAKE)
        assert.equal(state.tokenCalls, 0)
        assert.equal(state.meCalls, 0)
    })

    it("returns null without getAccessToken when no Discord account row exists", async () => {
        const id = await resolveDiscordUserSnowflake(INTERNAL_USER_ID, new Headers())
        assert.equal(id, null)
        assert.equal(state.tokenCalls, 0)
        assert.equal(state.meCalls, 0)
    })

    it("falls through to Discord @me using the Discord account row id", async () => {
        state.accounts = [
            { id: "acct_discord", providerId: "discord", accountId: "not-a-snowflake" },
        ]
        state.accessToken = { accessToken: "  live-token  " }
        const id = await resolveDiscordUserSnowflake(INTERNAL_USER_ID, new Headers())
        assert.equal(id, ME_SNOWFLAKE)
        assert.equal(state.tokenCalls, 1)
        assert.deepEqual(state.tokenBody, { accountId: "acct_discord" })
        assert.equal(state.meCalls, 1)
        assert.equal(state.meToken, "live-token")
    })

    it("returns null when getAccessToken returns a non-object", async () => {
        state.accounts = [
            { id: "acct_discord", providerId: "discord", accountId: "not-a-snowflake" },
        ]
        state.accessToken = "not-an-object"
        assert.equal(await resolveDiscordUserSnowflake(INTERNAL_USER_ID, new Headers()), null)
        assert.equal(state.meCalls, 0)
    })

    it("returns null when getAccessToken returns no usable accessToken", async () => {
        state.accounts = [
            { id: "acct_discord", providerId: "discord", accountId: "not-a-snowflake" },
        ]
        state.accessToken = { accessToken: "   " }
        assert.equal(await resolveDiscordUserSnowflake(INTERNAL_USER_ID, new Headers()), null)
        state.accessToken = {}
        assert.equal(await resolveDiscordUserSnowflake(INTERNAL_USER_ID, new Headers()), null)
        assert.equal(state.meCalls, 0)
    })

    it("returns null when getAccessToken throws", async () => {
        state.accounts = [
            { id: "acct_discord", providerId: "discord", accountId: "not-a-snowflake" },
        ]
        state.accessTokenThrows = true
        assert.equal(await resolveDiscordUserSnowflake(INTERNAL_USER_ID, new Headers()), null)
        assert.equal(state.meCalls, 0)
    })

    it("returns null when Discord @me fail-closes", async () => {
        state.accounts = [
            { id: "acct_discord", providerId: "discord", accountId: "not-a-snowflake" },
        ]
        state.meId = null
        assert.equal(await resolveDiscordUserSnowflake(INTERNAL_USER_ID, new Headers()), null)
        assert.equal(state.meCalls, 1)
    })
})
