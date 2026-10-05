import assert from "node:assert/strict"
import { describe, it, mock } from "node:test"

type Mode = "ok" | "denied" | "throw" | "raw"

const state: { mode: Mode; data: Record<string, unknown> } = {
    mode: "ok",
    data: {},
}

mock.module("@/server/fetch-bot-api", {
    namedExports: {
        serverFetchBot: async () => {
            if (state.mode === "throw") throw new Error("network down")
            if (state.mode === "raw") throw "offline"
            if (state.mode === "denied") {
                return new Response(
                    JSON.stringify({ ok: false, error: { error: "Not allowed." } }),
                    {
                        status: 403,
                        headers: { "content-type": "application/json" },
                    }
                )
            }
            return new Response(JSON.stringify({ ok: true, data: state.data }), {
                status: 200,
                headers: { "content-type": "application/json" },
            })
        },
    },
})

const {
    getPlayerStateAction,
    getPlayerQueueAction,
    postPlayerCommandAction,
    postPlayerPlayAction,
} = await import("../../../../src/web/lib/actions/player.actions.js")

describe("player actions", () => {
    it("returns player state", async () => {
        state.mode = "ok"
        state.data = { status: "playing", inVoiceWithBot: true }
        const result = await getPlayerStateAction("100000000000000001")
        assert.equal(result.ok, true)
        if (result.ok) assert.equal(result.data.status, "playing")
    })

    it("returns the bot error for player state", async () => {
        state.mode = "denied"
        const result = await getPlayerStateAction("100000000000000001")
        assert.deepEqual(result, { ok: false, error: "Not allowed." })
    })

    it("returns the thrown error for player state", async () => {
        state.mode = "throw"
        const result = await getPlayerStateAction("100000000000000001")
        assert.deepEqual(result, { ok: false, error: "network down" })
    })

    it("returns the player-state fallback when the throw is not an Error", async () => {
        state.mode = "raw"
        const result = await getPlayerStateAction("100000000000000001")
        assert.deepEqual(result, { ok: false, error: "Failed to load player state." })
    })

    it("returns the queue", async () => {
        state.mode = "ok"
        state.data = { items: [{ title: "Song" }], total: 1 }
        const result = await getPlayerQueueAction("100000000000000001", 1, 20)
        assert.equal(result.ok, true)
        if (result.ok) assert.equal(result.data.total, 1)
    })

    it("returns the bot error for the queue", async () => {
        state.mode = "denied"
        const result = await getPlayerQueueAction("100000000000000001", 1, 20)
        assert.deepEqual(result, { ok: false, error: "Not allowed." })
    })

    it("returns the thrown error for the queue", async () => {
        state.mode = "throw"
        const result = await getPlayerQueueAction("100000000000000001", 1, 20)
        assert.deepEqual(result, { ok: false, error: "network down" })
    })

    it("returns the queue fallback when the throw is not an Error", async () => {
        state.mode = "raw"
        const result = await getPlayerQueueAction("100000000000000001", 1, 20)
        assert.deepEqual(result, { ok: false, error: "Failed to load queue." })
    })

    it("returns player state after a command", async () => {
        state.mode = "ok"
        state.data = { status: "paused", queueCount: 0, hasPlayer: true }
        const result = await postPlayerCommandAction("100000000000000001", "pause")
        assert.equal(result.ok, true)
        if (result.ok) assert.equal(result.data.status, "paused")
    })

    it("returns the bot error for a player command", async () => {
        state.mode = "denied"
        const result = await postPlayerCommandAction("100000000000000001", "pause")
        assert.deepEqual(result, { ok: false, error: "Not allowed." })
    })

    it("returns the thrown error for a player command", async () => {
        state.mode = "throw"
        const result = await postPlayerCommandAction("100000000000000001", "skip")
        assert.deepEqual(result, { ok: false, error: "network down" })
    })

    it("returns the command fallback when the throw is not an Error", async () => {
        state.mode = "raw"
        const result = await postPlayerCommandAction("100000000000000001", "stop")
        assert.deepEqual(result, { ok: false, error: "Failed to send player command." })
    })

    it("returns player state after queueing a track", async () => {
        state.mode = "ok"
        state.data = { status: "playing", queueCount: 1, currentTrack: { title: "Song" } }
        const result = await postPlayerPlayAction(
            "100000000000000001",
            "song",
            "100000000000000002"
        )
        assert.equal(result.ok, true)
        if (result.ok) assert.equal(result.data.queueCount, 1)
    })

    it("returns the bot error for queueing a track", async () => {
        state.mode = "denied"
        const result = await postPlayerPlayAction(
            "100000000000000001",
            "song",
            "100000000000000002"
        )
        assert.deepEqual(result, { ok: false, error: "Not allowed." })
    })

    it("returns the thrown error for queueing a track", async () => {
        state.mode = "throw"
        const result = await postPlayerPlayAction(
            "100000000000000001",
            "song",
            "100000000000000002"
        )
        assert.deepEqual(result, { ok: false, error: "network down" })
    })

    it("returns the queue-track fallback when the throw is not an Error", async () => {
        state.mode = "raw"
        const result = await postPlayerPlayAction(
            "100000000000000001",
            "song",
            "100000000000000002"
        )
        assert.deepEqual(result, { ok: false, error: "Failed to queue track." })
    })
})
