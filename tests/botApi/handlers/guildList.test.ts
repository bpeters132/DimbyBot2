import assert from "node:assert/strict"
import { describe, it, mock } from "node:test"

const state = {
    session: {
        ok: true as const,
        session: {
            user: { id: "user-1", name: "Ada" },
            session: { id: "s", expiresAt: "2099-01-01" },
        },
    } as
        | {
              ok: true
              session: {
                  user: { id: string; name?: string }
                  session: { id: string; expiresAt: string }
              }
          }
        | { ok: false; status: number; error: string; details?: string },
    token: async (): Promise<{ accessToken?: string } | null> => ({ accessToken: "token" }),
    guilds: async () =>
        ({
            ok: true as const,
            guilds: [{ id: "100000000000000001", name: "Friends", icon: null }],
        }) as
            | { ok: true; guilds: Array<{ id: string; name: string; icon: string | null }> }
            | { ok: false; status: number },
    discordUserId: "100000000000000001" as string | null,
    client: readyClient() as null | ReturnType<typeof readyClient>,
}

function readyClient() {
    return {
        guilds: {
            cache: new Map([
                [
                    "100000000000000001",
                    {
                        memberCount: 3,
                        members: { me: { voice: { channelId: null as string | null } } },
                        voiceStates: { cache: new Map<string, { channelId?: string | null }>() },
                    },
                ],
            ]),
        },
        lavalink: { getPlayer: (_guildId: string) => undefined as unknown },
        error(..._args: unknown[]) {},
    }
}

mock.module("../../../src/shared/api-auth.js", {
    namedExports: {
        getAuthenticatedSession: async () => state.session,
    },
})

mock.module("../../../src/shared/auth-node.js", {
    namedExports: {
        auth: { api: { getAccessToken: () => state.token() } },
    },
})

mock.module("../../../src/util/discordUserGuilds.js", {
    namedExports: {
        fetchDiscordUserGuilds: () => state.guilds(),
    },
})

mock.module("../../../src/lib/botClientRegistry.js", {
    namedExports: {
        tryGetBotClient: () => state.client,
        getBotClient: () => state.client,
    },
})

mock.module("../../../src/shared/discord-user-id.js", {
    namedExports: {
        resolveDiscordUserSnowflake: async () => state.discordUserId,
    },
})

const { guildListGET } = await import("../../../src/botApi/handlers/guildList.js")

function errorOf(body: { ok: false; error: { error?: string; details?: string } }) {
    return body.error.error
}

describe("guildListGET", () => {
    it("returns the session failure status", async () => {
        state.session = { ok: false, status: 401, error: "Unauthorized", details: "Sign in." }
        const result = await guildListGET(new Headers())
        assert.equal(result.status, 401)
        assert.equal(errorOf(result.body as never), "Unauthorized")
        state.session = {
            ok: true,
            session: {
                user: { id: "user-1", name: "Ada" },
                session: { id: "s", expiresAt: "2099-01-01" },
            },
        }
    })

    it("returns 500 when the Discord access token lookup throws", async () => {
        state.token = async () => {
            throw new Error("auth down")
        }
        const result = await guildListGET(new Headers())
        assert.equal(result.status, 500)
        assert.equal(errorOf(result.body as never), "Failed to retrieve Discord access token.")
        state.token = async () => ({ accessToken: "token" })
    })

    it("returns 403 when the Discord access token is missing", async () => {
        state.token = async () => ({})
        const result = await guildListGET(new Headers())
        assert.equal(result.status, 403)
        assert.equal(errorOf(result.body as never), "Forbidden")
        state.token = async () => ({ accessToken: "token" })
    })

    it("returns 502 when loading Discord guilds throws", async () => {
        state.guilds = async () => {
            throw new Error("discord down")
        }
        const result = await guildListGET(new Headers())
        assert.equal(result.status, 502)
        assert.equal(errorOf(result.body as never), "Discord API request failed.")
        state.guilds = async () => ({
            ok: true,
            guilds: [{ id: "100000000000000001", name: "Friends", icon: null }],
        })
    })

    it("passes through a Discord guild-list HTTP failure", async () => {
        state.guilds = async () => ({ ok: false, status: 429 })
        const result = await guildListGET(new Headers())
        assert.equal(result.status, 429)
        assert.equal(errorOf(result.body as never), "Discord API request failed.")
        state.guilds = async () => ({
            ok: true,
            guilds: [{ id: "100000000000000001", name: "Friends", icon: null }],
        })
    })

    it("returns 503 when the bot client is not ready", async () => {
        state.client = null
        const result = await guildListGET(new Headers())
        assert.equal(result.status, 503)
        assert.equal(errorOf(result.body as never), "Bot is starting up")
        state.client = readyClient()
    })

    it("returns mutual guilds", async () => {
        const result = await guildListGET(new Headers())
        assert.equal(result.status, 200)
        assert.equal(result.body.ok, true)
        if (result.body.ok) {
            assert.equal(result.body.data.guilds[0]?.name, "Friends")
        }
    })
})
