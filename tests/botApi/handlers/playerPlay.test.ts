import assert from "node:assert/strict"
import { describe, it, mock } from "node:test"

const USER = "100000000000000002"
const GUILD = "100000000000000001"

const guardOk = {
    ok: true as const,
    discordUserId: USER,
    session: { user: { id: "u", name: "Ada" }, session: { id: "s", expiresAt: "2099-01-01" } },
    permissionResolution: {},
}

const state = {
    guard: guardOk as
        | typeof guardOk
        | { ok: false; status: number; error: string; details?: string },
    enqueue: { ok: true as const, player: null as unknown, playbackStarted: false } as
        | { ok: true; player: unknown; playbackStarted: boolean }
        | { ok: false; status: number; error: { error: string } },
    enqueueThrows: false,
}

mock.module("../../../src/shared/api-auth.js", {
    namedExports: {
        requirePermissions: async () => state.guard,
    },
})

mock.module("../../../src/lib/botClientRegistry.js", {
    namedExports: {
        getBotClient: () => ({ lavalink: { getPlayer: () => null } }),
        tryGetBotClient: () => null,
    },
})

mock.module("../../../src/botApi/handlers/searchAndEnqueue.js", {
    namedExports: {
        searchAndEnqueue: async () => {
            if (state.enqueueThrows) throw new Error("enqueue exploded")
            return state.enqueue
        },
    },
})

const { playerPlayPOST } = await import("../../../src/botApi/handlers/playerPlay.js")

describe("playerPlayPOST", () => {
    it("returns the permission failure", async () => {
        state.guard = {
            ok: false,
            status: 403,
            error: "Forbidden",
            details: "No queue permission.",
        }
        const result = await playerPlayPOST(new Headers(), GUILD, { query: "song" })
        assert.equal(result.status, 403)
        assert.equal(result.body.ok === false && result.body.error.error, "Forbidden")
        state.guard = guardOk
    })

    it("returns 400 when requesterDiscordUserId is empty", async () => {
        const result = await playerPlayPOST(new Headers(), GUILD, {
            query: "song",
            requesterDiscordUserId: "  ",
        })
        assert.equal(result.status, 400)
        assert.equal(
            result.body.ok === false && result.body.error.error,
            "Invalid requesterDiscordUserId."
        )
    })

    it("returns 403 when requesterDiscordUserId does not match the session", async () => {
        const result = await playerPlayPOST(new Headers(), GUILD, {
            query: "song",
            requesterDiscordUserId: "100000000000000009",
        })
        assert.equal(result.status, 403)
        assert.equal(result.body.ok === false && result.body.error.error, "Forbidden")
    })

    it("returns 400 when the query is missing", async () => {
        const result = await playerPlayPOST(new Headers(), GUILD, {})
        assert.equal(result.status, 400)
        assert.equal(result.body.ok === false && result.body.error.error, "Query is required.")
    })

    it("returns the enqueue failure", async () => {
        state.enqueue = { ok: false, status: 400, error: { error: "Join a voice channel first." } }
        const result = await playerPlayPOST(new Headers(), GUILD, { query: "song" })
        assert.equal(result.status, 400)
        assert.equal(
            result.body.ok === false && result.body.error.error,
            "Join a voice channel first."
        )
    })

    it("returns 500 when enqueue throws", async () => {
        state.enqueueThrows = true
        const result = await playerPlayPOST(new Headers(), GUILD, { query: "song" })
        assert.equal(result.status, 500)
        assert.equal(result.body.ok === false && result.body.error.error, "Internal server error.")
        state.enqueueThrows = false
    })

    it("returns player state after a successful enqueue", async () => {
        state.enqueue = {
            ok: true,
            playbackStarted: true,
            player: {
                guildId: GUILD,
                playing: true,
                paused: false,
                position: 0,
                repeatMode: "off",
                volume: 100,
                voiceChannelId: "voice-1",
                queue: { current: null, tracks: [] },
                get: () => false,
            },
        }
        const result = await playerPlayPOST(new Headers(), GUILD, { query: "song" })
        assert.equal(result.status, 200)
        if (result.body.ok) assert.equal(result.body.data.status, "playing")
    })
})
