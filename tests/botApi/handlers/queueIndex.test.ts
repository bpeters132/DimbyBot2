import assert from "node:assert/strict"
import { beforeEach, describe, it, mock } from "node:test"

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
    /** When set, overrides `state.player` so tests can swap identity across getPlayer calls. */
    resolvePlayer: null as null | (() => null | ReturnType<typeof tracksPlayer>),
    clientThrows: false,
}

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
            return {
                lavalink: {
                    getPlayer: () => (state.resolvePlayer ? state.resolvePlayer() : state.player),
                },
            }
        },
    },
})

const { queueIndexDELETE, queueIndexPATCH } =
    await import("../../../src/botApi/handlers/queueIndex.js")
const { setPlayerSessionPersistenceDbForTests } =
    await import("../../../src/util/playerSessionPersistence.js")

describe("queue index handlers", () => {
    beforeEach(() => {
        setPlayerSessionPersistenceDbForTests({
            upsertPlayerSession: async () => undefined,
            deletePlayerSession: async () => undefined,
        })
        state.guard = guardOk
        state.clientThrows = false
        state.resolvePlayer = null
        state.player = null
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

    it("refuses delete when /stop+/play replaces the player during the lock wait", async () => {
        const original = tracksPlayer(["a", "b"])
        const successor = tracksPlayer(["x", "y", "z"])
        let gets = 0
        state.resolvePlayer = () => {
            gets += 1
            // First getPlayer is capture-before-lock; later calls see the successor.
            return gets === 1 ? original : successor
        }
        const result = await queueIndexDELETE(new Headers(), GUILD, "0")
        assert.equal(result.status, 409)
        assert.equal(result.body.ok === false && result.body.error.error, "player_replaced")
        assert.equal(original.queue.tracks.length, 2)
        assert.equal(successor.queue.tracks.length, 3)
        assert.equal(successor.queue.tracks[0]?.info.title, "x")
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

    it("refuses reorder when /stop+/play replaces the player during the lock wait", async () => {
        const original = tracksPlayer(["a", "b", "c"])
        const successor = tracksPlayer(["x", "y", "z"])
        let gets = 0
        state.resolvePlayer = () => {
            gets += 1
            return gets === 1 ? original : successor
        }
        const result = await queueIndexPATCH(new Headers(), GUILD, "0", { newIndex: 2 })
        assert.equal(result.status, 409)
        assert.equal(result.body.ok === false && result.body.error.error, "player_replaced")
        assert.deepEqual(
            original.queue.tracks.map((t) => t.info.title),
            ["a", "b", "c"]
        )
        assert.deepEqual(
            successor.queue.tracks.map((t) => t.info.title),
            ["x", "y", "z"]
        )
    })

    it("returns 500 when reorder throws", async () => {
        state.clientThrows = true
        const result = await queueIndexPATCH(new Headers(), GUILD, "0", { newIndex: 1 })
        assert.equal(result.status, 500)
        assert.equal(result.body.ok === false && result.body.error.details, "Internal server error")
    })
})
