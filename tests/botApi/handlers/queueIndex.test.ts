import assert from "node:assert/strict"
import { before, beforeEach, describe, it, mock } from "node:test"

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
    player: null as null | ReturnType<typeof tracksPlayer>,
    clientThrows: false,
}

const broadcasts: Array<{ guildId: string; player: unknown; type: string }> = []

function tracksPlayer(ids: string[]) {
    const tracks = ids.map((id) => ({
        info: { title: id, uri: `https://example.com/${id}`, duration: 1, author: "Artist" },
    }))
    return {
        guildId: GUILD,
        playing: false,
        get: () => false,
        queue: {
            tracks,
            async splice(start: number, count: number, ...insert: unknown[]) {
                return tracks.splice(start, count, ...(insert.flat() as typeof tracks))
            },
        },
    }
}

/** Simulates `/stop` destroying the manager player during a yielding splice. */
function dropPlayerDuringSplice(player: ReturnType<typeof tracksPlayer>): void {
    const originalSplice = player.queue.splice.bind(player.queue)
    player.queue.splice = async (...args: Parameters<typeof player.queue.splice>) => {
        const removed = await originalSplice(...args)
        state.player = null
        return removed
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
        getBotClient: () => {
            if (state.clientThrows) throw new Error("bot down")
            return { lavalink: { getPlayer: () => state.player } }
        },
    },
})

mock.module("../../../src/shared/websocket/PlayerBroadcaster.js", {
    namedExports: {
        playerBroadcaster: {
            broadcastPlayerEvent(guildId: string, player: unknown, type: string) {
                broadcasts.push({ guildId, player, type })
            },
        },
    },
})

const { queueIndexDELETE, queueIndexPATCH } =
    await import("../../../src/botApi/handlers/queueIndex.js")
const { setPlayerSessionPersistenceDbForTests } =
    await import("../../../src/util/playerSessionPersistence.js")

describe("queue index handlers", () => {
    before(() => {
        setPlayerSessionPersistenceDbForTests({
            upsertPlayerSession: async () => undefined,
            deletePlayerSession: async () => undefined,
        })
    })

    beforeEach(() => {
        state.guard = guardOk
        state.clientThrows = false
        state.player = null
        broadcasts.length = 0
    })

    it("returns 400 when the delete index is invalid", async () => {
        const result = await queueIndexDELETE(new Headers(), GUILD, "-1")
        assert.equal(result.status, 400)
        assert.equal(
            result.body.ok === false && result.body.error.error,
            "Queue index must be a non-negative integer."
        )
    })

    it("returns 404 when delete has no player", async () => {
        state.player = null
        const result = await queueIndexDELETE(new Headers(), GUILD, "0")
        assert.equal(result.status, 404)
        assert.equal(
            result.body.ok === false && result.body.error.error,
            "No active player for this guild."
        )
    })

    it("returns 404 when the delete index is out of range", async () => {
        state.player = tracksPlayer(["a"])
        const result = await queueIndexDELETE(new Headers(), GUILD, "3")
        assert.equal(result.status, 404)
        assert.equal(
            result.body.ok === false && result.body.error.error,
            "Queue index out of range."
        )
    })

    it("returns the queue after deleting a track", async () => {
        state.player = tracksPlayer(["a", "b"])
        const result = await queueIndexDELETE(new Headers(), GUILD, "0")
        assert.equal(result.status, 200)
        if (result.body.ok) assert.equal(result.body.data.total, 1)
    })

    it("broadcasts queueUpdate after delete when the player is still live", async () => {
        const player = tracksPlayer(["a", "b"])
        state.player = player
        const result = await queueIndexDELETE(new Headers(), GUILD, "0")
        assert.equal(result.status, 200)
        if (result.body.ok) assert.equal(result.body.data.total, 1)
        assert.equal(broadcasts.length, 1)
        assert.equal(broadcasts[0].guildId, GUILD)
        assert.equal(broadcasts[0].type, "queueUpdate")
        assert.equal(broadcasts[0].player, player)
    })

    it("returns 200 with an empty queue and does not broadcast after delete if /stop raced splice", async () => {
        const player = tracksPlayer(["a", "b"])
        state.player = player
        dropPlayerDuringSplice(player)
        const result = await queueIndexDELETE(new Headers(), GUILD, "0")
        assert.equal(result.status, 200)
        assert.equal(result.body.ok, true)
        if (result.body.ok) {
            assert.equal(result.body.data.total, 0)
            assert.equal(result.body.data.guildId, GUILD)
        }
        assert.notEqual(result.status, 404)
        assert.deepEqual(broadcasts, [])
        // The captured player still has the leftover track; the HTTP body must not serialize it.
        assert.equal(player.queue.tracks.length, 1)
    })

    it("returns 500 when delete throws", async () => {
        state.clientThrows = true
        const result = await queueIndexDELETE(new Headers(), GUILD, "0")
        assert.equal(result.status, 500)
        assert.equal(result.body.ok === false && result.body.error.error, "Internal server error")
        state.clientThrows = false
    })

    it("returns 400 when reorder indexes are invalid", async () => {
        const result = await queueIndexPATCH(new Headers(), GUILD, "0", { newIndex: -1 })
        assert.equal(result.status, 400)
        assert.equal(
            result.body.ok === false && result.body.error.error,
            "Both queue indexes must be non-negative integers."
        )
    })

    it("returns 404 when reorder has no player", async () => {
        state.player = null
        const result = await queueIndexPATCH(new Headers(), GUILD, "0", { newIndex: 1 })
        assert.equal(result.status, 404)
        assert.equal(
            result.body.ok === false && result.body.error.error,
            "No active player for this guild."
        )
    })

    it("returns the queue after a reorder", async () => {
        state.player = tracksPlayer(["a", "b"])
        const result = await queueIndexPATCH(new Headers(), GUILD, "0", { newIndex: 1 })
        assert.equal(result.status, 200)
        if (result.body.ok) assert.equal(result.body.data.total, 2)
    })

    it("returns 200 with an empty queue and does not broadcast after reorder if /stop raced splice", async () => {
        const player = tracksPlayer(["a", "b"])
        state.player = player
        dropPlayerDuringSplice(player)
        const result = await queueIndexPATCH(new Headers(), GUILD, "0", { newIndex: 1 })
        assert.equal(result.status, 200)
        assert.equal(result.body.ok, true)
        if (result.body.ok) {
            assert.equal(result.body.data.total, 0)
            assert.equal(result.body.data.guildId, GUILD)
        }
        assert.notEqual(result.status, 404)
        assert.deepEqual(broadcasts, [])
        assert.equal(player.queue.tracks.length, 2)
    })

    it("restores the removed track and returns 500 when reorder insert fails", async () => {
        const player = tracksPlayer(["a", "b"])
        state.player = player
        let spliceCalls = 0
        const originalSplice = player.queue.splice.bind(player.queue)
        player.queue.splice = async (start: number, count: number, ...insert: unknown[]) => {
            spliceCalls += 1
            if (spliceCalls === 2) throw new Error("insert failed")
            return originalSplice(start, count, ...insert)
        }
        const result = await queueIndexPATCH(new Headers(), GUILD, "0", { newIndex: 1 })
        assert.equal(result.status, 500)
        assert.equal(result.body.ok === false && result.body.error.error, "Internal server error")
        assert.deepEqual(
            player.queue.tracks.map((track) => track.info.title),
            ["a", "b"]
        )
        assert.deepEqual(broadcasts, [])
    })

    it("returns 500 when reorder throws", async () => {
        state.clientThrows = true
        const result = await queueIndexPATCH(new Headers(), GUILD, "0", { newIndex: 1 })
        assert.equal(result.status, 500)
        assert.equal(result.body.ok === false && result.body.error.details, "Internal server error")
    })
})
