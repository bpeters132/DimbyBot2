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

type QueuePlayer = {
    queue: { tracks: unknown[]; splice: (start: number, count: number) => Promise<unknown> }
}

const broadcasts: { guildId: string; type: string }[] = []

const state = {
    guard: guardOk as
        | typeof guardOk
        | { ok: false; status: number; error: string; details?: string },
    enqueueThrows: false,
    enqueue: { ok: true as const, player: null as unknown } as
        | { ok: true; player: unknown }
        | { ok: false; status: number; error: { error: string } },
    player: null as null | QueuePlayer,
    getPlayerImpl: null as null | (() => QueuePlayer | null),
    clearThrows: false,
}

function upcomingPlayer(ids: string[]): QueuePlayer {
    const tracks: unknown[] = ids.map((id) => ({
        info: { title: id, uri: `https://example.com/${id}` },
    }))
    return {
        queue: {
            tracks,
            async splice(start: number, count: number) {
                if (state.clearThrows) throw new Error("clear failed")
                tracks.splice(start, count)
            },
        },
    }
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
                getPlayer: () => (state.getPlayerImpl ? state.getPlayerImpl() : state.player),
            },
        }),
    },
})

mock.module("../../../src/shared/websocket/PlayerBroadcaster.js", {
    namedExports: {
        playerBroadcaster: {
            broadcastPlayerEvent(guildId: string, _player: unknown, type: string) {
                broadcasts.push({ guildId, type })
            },
        },
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
        broadcasts.length = 0
        state.getPlayerImpl = null
        state.clearThrows = false
        state.player = upcomingPlayer(["a"])
        const result = await queueDELETE(new Headers(), GUILD)
        assert.equal(result.status, 200)
        if (result.body.ok) assert.equal(result.body.data.total, 0)
        assert.deepEqual(broadcasts, [{ guildId: GUILD, type: "queueUpdate" }])
    })

    it("returns 200 empty and does not broadcast when there is no player", async () => {
        broadcasts.length = 0
        state.getPlayerImpl = null
        state.player = null
        const result = await queueDELETE(new Headers(), GUILD)
        assert.equal(result.status, 200)
        if (result.body.ok) assert.equal(result.body.data.total, 0)
        assert.equal(broadcasts.length, 0)
    })

    it("returns 409 and leaves successor upcoming untouched when /stop+/play replaced the player", async () => {
        broadcasts.length = 0
        const original = upcomingPlayer(["old-a", "old-b"])
        const successor = upcomingPlayer(["new-a", "new-b"])
        let lookups = 0
        state.getPlayerImpl = () => {
            lookups += 1
            return lookups === 1 ? original : successor
        }
        const result = await queueDELETE(new Headers(), GUILD)
        assert.equal(result.status, 409)
        assert.equal(result.body.ok === false && result.body.error.error, "player_replaced")
        assert.equal(
            result.body.ok === false && result.body.error.details,
            "The player was replaced. Try again."
        )
        assert.equal(successor.queue.tracks.length, 2)
        assert.equal(original.queue.tracks.length, 2)
        assert.equal(broadcasts.length, 0)
        state.getPlayerImpl = null
    })

    it("returns 200 empty and does not broadcast when /stop destroyed the player during clear", async () => {
        broadcasts.length = 0
        const original = upcomingPlayer(["a", "b"])
        let lookups = 0
        state.getPlayerImpl = () => {
            lookups += 1
            return lookups === 1 ? original : null
        }
        const result = await queueDELETE(new Headers(), GUILD)
        assert.equal(result.status, 200)
        if (result.body.ok) assert.equal(result.body.data.total, 0)
        assert.equal(broadcasts.length, 0)
        state.getPlayerImpl = null
    })

    it("returns 200 empty and does not broadcast when /stop races splice after a successful clear", async () => {
        broadcasts.length = 0
        const original = upcomingPlayer(["a", "b"])
        state.getPlayerImpl = () => {
            if (original.queue.tracks.length === 0) return null
            return original
        }
        const result = await queueDELETE(new Headers(), GUILD)
        assert.equal(result.status, 200)
        if (result.body.ok) assert.equal(result.body.data.total, 0)
        assert.equal(original.queue.tracks.length, 0)
        assert.equal(broadcasts.length, 0)
        state.getPlayerImpl = null
    })

    it("returns 500 when clearing the queue throws", async () => {
        broadcasts.length = 0
        state.getPlayerImpl = null
        state.clearThrows = true
        state.player = upcomingPlayer(["a"])
        const result = await queueDELETE(new Headers(), GUILD)
        assert.equal(result.status, 500)
        assert.equal(result.body.ok === false && result.body.error.error, "Internal server error")
        assert.equal(broadcasts.length, 0)
        state.clearThrows = false
    })
})
