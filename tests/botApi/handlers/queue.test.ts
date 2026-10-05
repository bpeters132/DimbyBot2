import assert from "node:assert/strict"
import { before, describe, it, mock } from "node:test"

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
    enqueueThrows: false,
    enqueue: { ok: true as const, player: null as unknown } as
        | { ok: true; player: unknown }
        | { ok: false; status: number; error: { error: string } },
    player: null as null | {
        queue: { tracks: unknown[]; splice: (start: number, count: number) => Promise<unknown> }
    },
    clearThrows: false,
}

mock.module("../../../src/shared/api-auth.js", {
    namedExports: {
        requirePermissions: async () => state.guard,
    },
})

mock.module("../../../src/lib/botClientRegistry.js", {
    namedExports: {
        tryGetBotClient: () => null,
        getBotClient: () => ({
            lavalink: {
                getPlayer: () => state.player,
            },
        }),
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

const { queueGET, queuePOST, queueDELETE } = await import("../../../src/botApi/handlers/queue.js")
const { setPlayerSessionPersistenceDbForTests } =
    await import("../../../src/util/playerSessionPersistence.js")

describe("queue handlers", () => {
    before(() => {
        setPlayerSessionPersistenceDbForTests({
            upsertPlayerSession: async () => undefined,
            deletePlayerSession: async () => undefined,
        })
    })

    it("returns the queue GET permission failure", async () => {
        state.guard = { ok: false, status: 401, error: "Unauthorized" }
        const result = await queueGET(new Headers(), GUILD, new URLSearchParams())
        assert.equal(result.status, 401)
        assert.equal(result.body.ok === false && result.body.error.error, "Unauthorized")
        state.guard = guardOk
    })

    it("returns an empty queue", async () => {
        state.player = null
        const result = await queueGET(new Headers(), GUILD, new URLSearchParams("page=1&limit=20"))
        assert.equal(result.status, 200)
        if (result.body.ok) assert.equal(result.body.data.total, 0)
    })

    it("returns 400 when the enqueue query is missing", async () => {
        const result = await queuePOST(new Headers(), GUILD, {})
        assert.equal(result.status, 400)
        assert.equal(result.body.ok === false && result.body.error.error, "Query is required.")
    })

    it("returns the enqueue failure from queue POST", async () => {
        state.enqueue = { ok: false, status: 404, error: { error: "No matches found." } }
        const result = await queuePOST(new Headers(), GUILD, { query: "song" })
        assert.equal(result.status, 404)
        assert.equal(result.body.ok === false && result.body.error.error, "No matches found.")
    })

    it("returns 500 when queue POST throws", async () => {
        state.enqueueThrows = true
        const result = await queuePOST(new Headers(), GUILD, { query: "song" })
        assert.equal(result.status, 500)
        assert.equal(result.body.ok === false && result.body.error.error, "Internal server error")
        state.enqueueThrows = false
    })

    it("returns the queue after enqueue", async () => {
        state.enqueue = {
            ok: true,
            player: {
                guildId: GUILD,
                playing: true,
                queue: {
                    current: null,
                    tracks: [{ info: { title: "Song", uri: "https://example.com/s" } }],
                },
                get: () => false,
            },
        }
        const result = await queuePOST(new Headers(), GUILD, { query: "song" })
        assert.equal(result.status, 200)
        if (result.body.ok) assert.equal(result.body.data.total, 1)
    })

    it("returns the queue after clearing upcoming tracks", async () => {
        state.player = {
            queue: {
                tracks: [{}],
                splice: async (start: number, count: number) => {
                    if (state.clearThrows) throw new Error("clear failed")
                    state.player?.queue.tracks.splice(start, count)
                },
            },
        }
        state.clearThrows = false
        const result = await queueDELETE(new Headers(), GUILD)
        assert.equal(result.status, 200)
        if (result.body.ok) assert.equal(result.body.data.total, 0)
    })

    it("returns 500 when clearing the queue throws", async () => {
        state.player = {
            queue: {
                tracks: [{}],
                splice: async () => {
                    throw new Error("clear failed")
                },
            },
        }
        const result = await queueDELETE(new Headers(), GUILD)
        assert.equal(result.status, 500)
        assert.equal(result.body.ok === false && result.body.error.error, "Internal server error")
    })
})
