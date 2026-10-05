import assert from "node:assert/strict"
import { describe, it, mock } from "node:test"

const GUILD = "100000000000000001"
const USER = "100000000000000002"

const state = {
    session: {
        ok: true as const,
        session: { user: { id: "user-1" }, session: { id: "s", expiresAt: "2099-01-01" } },
    } as
        | {
              ok: true
              session: { user: { id: string }; session: { id: string; expiresAt: string } }
          }
        | { ok: false; status: number; error: string; details?: string },
    discordUserId: USER as string | null,
    client: null as null | {
        guilds: {
            cache: Map<
                string,
                {
                    name: string
                    icon: string | null
                    voiceStates: { cache: Map<string, { channelId: string | null }> }
                }
            >
        }
        lavalink: { players: Map<string, unknown> }
    },
}

function readyClient(player: unknown) {
    return {
        guilds: {
            cache: new Map([
                [
                    GUILD,
                    {
                        name: "Friends",
                        icon: null,
                        voiceStates: { cache: new Map([[USER, { channelId: "voice-1" }]]) },
                    },
                ],
            ]),
        },
        lavalink: { players: new Map([[GUILD, player]]) },
    }
}

mock.module("../../../src/shared/api-auth.js", {
    namedExports: {
        getAuthenticatedSession: async () => state.session,
    },
})

mock.module("../../../src/shared/discord-user-id.js", {
    namedExports: {
        resolveDiscordUserSnowflake: async () => state.discordUserId,
    },
})

mock.module("../../../src/lib/botClientRegistry.js", {
    namedExports: {
        tryGetBotClient: () => state.client,
        getBotClient: () => {
            if (!state.client) throw new Error("Bot client is not initialized yet.")
            return state.client
        },
    },
})

const { voiceContextGET } = await import("../../../src/botApi/handlers/voiceContext.js")

describe("voiceContextGET", () => {
    it("returns the session failure", async () => {
        state.session = { ok: false, status: 401, error: "Unauthorized" }
        const result = await voiceContextGET(new Headers())
        assert.equal(result.status, 401)
        assert.equal(result.body.ok === false && result.body.error.error, "Unauthorized")
        state.session = {
            ok: true,
            session: { user: { id: "user-1" }, session: { id: "s", expiresAt: "2099-01-01" } },
        }
    })

    it("returns 403 when the Discord user id is missing", async () => {
        state.discordUserId = null
        state.client = readyClient(null)
        const result = await voiceContextGET(new Headers())
        assert.equal(result.status, 403)
        assert.equal(
            result.body.ok === false && result.body.error.error,
            "Discord account required"
        )
        state.discordUserId = USER
    })

    it("returns 503 when the bot is not ready", async () => {
        state.client = null
        const result = await voiceContextGET(new Headers())
        assert.equal(result.status, 503)
        assert.equal(result.body.ok === false && result.body.error.error, "Bot is starting up")
    })

    it("returns no active guild when the viewer is not with the bot", async () => {
        state.client = readyClient({
            guildId: GUILD,
            playing: false,
            voiceChannelId: "voice-9",
            queue: { current: null, tracks: [] },
            get: () => undefined,
        })
        const result = await voiceContextGET(new Headers())
        assert.equal(result.status, 200)
        assert.equal(result.body.ok, true)
        if (result.body.ok) assert.equal(result.body.data.activeGuild, null)
    })

    it("returns the guild where the viewer shares an active player", async () => {
        state.client = readyClient({
            guildId: GUILD,
            playing: true,
            paused: false,
            voiceChannelId: "voice-1",
            queue: { current: { info: { title: "Song" } }, tracks: [] },
            get: () => undefined,
        })
        const result = await voiceContextGET(new Headers())
        assert.equal(result.status, 200)
        if (result.body.ok) {
            assert.equal(result.body.data.activeGuild?.guildName, "Friends")
            assert.equal(result.body.data.activeGuild?.currentTrackTitle, "Song")
        }
    })
})
