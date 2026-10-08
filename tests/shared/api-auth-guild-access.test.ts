import assert from "node:assert/strict"
import { afterEach, describe, it, mock } from "node:test"

const GUILD = "100000000000000001"
const USER = "100000000000000002"
const OWNER = "100000000000000003"

const session = {
    user: { id: "better-auth-user" },
    session: { id: "s", expiresAt: "2099-01-01" },
}

const state = {
    session: {
        user: { id: "better-auth-user" },
        session: { id: "s", expiresAt: "2099-01-01" },
    } as typeof session | null,
    discordUserId: USER as string | null,
    accessToken: "discord-oauth-token" as string | null,
    accessTokenThrows: false as boolean,
    guilds: async (): Promise<
        | { ok: true; guilds: Array<{ id: string; name: string; icon: string | null }> }
        | { ok: false; status: number; message: string }
    > => ({
        ok: true,
        guilds: [{ id: GUILD, name: "Friends", icon: null }],
    }),
    client: null as null | {
        guilds: {
            cache: Map<
                string,
                {
                    ownerId: string
                    voiceStates: { cache: Map<string, { member?: unknown }> }
                    members: { fetch: (userId: string) => Promise<unknown> }
                }
            >
        }
    },
}

function resetState() {
    state.session = {
        user: { id: "better-auth-user" },
        session: { id: "s", expiresAt: "2099-01-01" },
    }
    state.discordUserId = USER
    state.accessToken = "discord-oauth-token"
    state.accessTokenThrows = false
    state.guilds = async () => ({
        ok: true,
        guilds: [{ id: GUILD, name: "Friends", icon: null }],
    })
    state.client = null
}

function cachedGuild(opts: {
    ownerId?: string
    voiceMember?: unknown
    memberFetch?: (userId: string) => Promise<unknown>
}) {
    const userId = USER
    const voiceStates = new Map<string, { member?: unknown }>()
    if (opts.voiceMember !== undefined) {
        voiceStates.set(userId, { member: opts.voiceMember })
    }
    return {
        guilds: {
            cache: new Map([
                [
                    GUILD,
                    {
                        ownerId: opts.ownerId ?? OWNER,
                        voiceStates: { cache: voiceStates },
                        members: {
                            fetch:
                                opts.memberFetch ??
                                (async () => {
                                    return null
                                }),
                        },
                    },
                ],
            ]),
        },
    }
}

mock.module("../../src/shared/auth-node.js", {
    namedExports: {
        auth: {
            api: {
                getSession: async () => state.session,
                getAccessToken: async () => {
                    if (state.accessTokenThrows) throw new Error("token lookup failed")
                    return state.accessToken ? { accessToken: state.accessToken } : {}
                },
            },
        },
    },
})

mock.module("../../src/shared/discord-user-id.js", {
    namedExports: {
        resolveDiscordUserSnowflake: async () => state.discordUserId,
    },
})

mock.module("../../src/lib/botClientRegistry.js", {
    namedExports: {
        tryGetBotClient: () => state.client,
        getBotClient: () => state.client,
    },
})

mock.module("../../src/shared/discord-rest.js", {
    namedExports: {
        fetchDiscordUserGuilds: async () => state.guilds(),
        fetchDiscordCurrentUserId: async () => null,
        parseDiscordUsersMeId: () => null,
    },
})

const { resolveAuthenticatedGuildAccess, verifyGuildAccess } =
    await import("../../src/shared/api-auth.js")

afterEach(() => {
    resetState()
})

describe("verifyGuildAccess", () => {
    it("treats a missing Discord access token as retryable (HTTP 503 via the mapper)", async () => {
        state.accessToken = null
        const result = await verifyGuildAccess(session, GUILD, new Headers(), USER)
        assert.deepEqual(result, {
            ok: false,
            retryable: true,
            error: "Missing or expired Discord access token.",
        })
    })

    it("allows OAuth guild-list membership without a bot GuildMember (memberResolved false)", async () => {
        const result = await verifyGuildAccess(session, GUILD, new Headers(), USER)
        assert.deepEqual(result, { ok: true, memberResolved: false })
    })

    it("rejects OAuth guild-list misses as non-retryable (HTTP 403 via the mapper)", async () => {
        state.guilds = async () => ({
            ok: true,
            guilds: [{ id: "999999999999999999", name: "Other", icon: null }],
        })
        const result = await verifyGuildAccess(session, GUILD, new Headers(), USER)
        assert.deepEqual(result, { ok: false, retryable: false })
    })

    it("treats Discord 5xx guild-list failures as retryable", async () => {
        state.guilds = async () => ({
            ok: false,
            status: 503,
            message: "Discord API returned HTTP 503.",
        })
        const result = await verifyGuildAccess(session, GUILD, new Headers(), USER)
        assert.deepEqual(result, {
            ok: false,
            retryable: true,
            error: "Discord API returned HTTP 503.",
        })
    })

    it("allows the guild owner from cache without resolving a GuildMember", async () => {
        state.client = cachedGuild({ ownerId: USER })
        let oauthCalled = false
        state.guilds = async () => {
            oauthCalled = true
            return { ok: true, guilds: [] }
        }
        const result = await verifyGuildAccess(session, GUILD, new Headers(), USER)
        assert.deepEqual(result, { ok: true, memberResolved: false })
        assert.equal(oauthCalled, false)
    })

    it("sets memberResolved true when the bot returns a GuildMember", async () => {
        state.client = cachedGuild({
            voiceMember: { id: USER, partial: false },
        })
        const result = await verifyGuildAccess(session, GUILD, new Headers(), USER)
        assert.deepEqual(result, { ok: true, memberResolved: true })
    })

    it("treats getAccessToken throws as retryable", async () => {
        state.accessTokenThrows = true
        const result = await verifyGuildAccess(session, GUILD, new Headers(), USER)
        assert.equal(result.ok, false)
        if (result.ok === false) {
            assert.equal(result.retryable, true)
            assert.match(result.error ?? "", /token lookup failed/)
        }
    })
})

describe("resolveAuthenticatedGuildAccess", () => {
    it("forwards a missing session as 401", async () => {
        state.session = null
        const result = await resolveAuthenticatedGuildAccess(new Headers(), GUILD)
        assert.deepEqual(result, { ok: false, status: 401, error: "Unauthorized" })
    })

    it("maps retryable guild-access failure to 503", async () => {
        state.accessToken = null
        const result = await resolveAuthenticatedGuildAccess(new Headers(), GUILD)
        assert.equal(result.ok, false)
        if (result.ok === false) {
            assert.equal(result.status, 503)
            assert.equal(result.error, "Service temporarily unavailable")
            assert.match(String(result.details), /Missing or expired Discord access token/)
        }
    })

    it("maps a non-retryable membership miss to 403 without leaking OAuth errors", async () => {
        state.guilds = async () => ({
            ok: true,
            guilds: [{ id: "999999999999999999", name: "Other", icon: null }],
        })
        const result = await resolveAuthenticatedGuildAccess(new Headers(), GUILD)
        assert.equal(result.ok, false)
        if (result.ok === false) {
            assert.equal(result.status, 403)
            assert.equal(result.error, "Forbidden")
            assert.match(String(result.details), /Could not verify access to this server/)
        }
    })

    it("returns session, snowflake, and memberResolved on success", async () => {
        state.client = cachedGuild({
            voiceMember: { id: USER, partial: false },
        })
        const result = await resolveAuthenticatedGuildAccess(new Headers(), GUILD)
        assert.deepEqual(result, {
            ok: true,
            session: state.session,
            discordUserId: USER,
            memberResolved: true,
        })
    })
})
