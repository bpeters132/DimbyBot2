import assert from "node:assert/strict"
import { describe, it, mock } from "node:test"

type Mode = "ok" | "denied" | "throw" | "raw" | "timeout"

const state: { mode: Mode; data: Record<string, unknown> } = {
    mode: "ok",
    data: {},
}

mock.module("@/server/fetch-bot-api", {
    namedExports: {
        serverFetchBot: async () => {
            if (state.mode === "throw") throw new Error("network down")
            if (state.mode === "raw") throw "offline"
            if (state.mode === "timeout") {
                return new Response(
                    JSON.stringify({ ok: false, error: { error: "Gateway Timeout" } }),
                    {
                        status: 504,
                        headers: { "content-type": "application/json" },
                    }
                )
            }
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
    getPlaylistsAction,
    getPlaylistAction,
    createPlaylistAction,
    deletePlaylistAction,
    addTrackToPlaylistAction,
    removeTrackFromPlaylistAction,
    addTrackFromQueryToPlaylistAction,
    movePlaylistTrackAction,
    playPlaylistInGuildAction,
} = await import("../../../../src/web/lib/actions/playlist.actions.js")

const track = {
    title: "Song",
    uri: "https://example.com/song",
    author: "Artist",
    duration: 10,
    thumbnailUrl: null,
    addedAt: "2026-01-01T00:00:00.000Z",
}

describe("playlist actions", () => {
    it("returns playlists", async () => {
        state.mode = "ok"
        state.data = { playlists: [{ name: "Mix" }] }
        const result = await getPlaylistsAction()
        assert.equal(result.ok, true)
        if (result.ok) assert.equal(result.data.playlists[0]?.name, "Mix")
    })

    it("returns the bot error for the playlist list", async () => {
        state.mode = "denied"
        const result = await getPlaylistsAction()
        assert.deepEqual(result, { ok: false, error: "Not allowed." })
    })

    it("returns the thrown error for the playlist list", async () => {
        state.mode = "throw"
        const result = await getPlaylistsAction()
        assert.deepEqual(result, { ok: false, error: "network down" })
    })

    it("returns the playlist-list fallback when the throw is not an Error", async () => {
        state.mode = "raw"
        const result = await getPlaylistsAction()
        assert.deepEqual(result, { ok: false, error: "Failed to load playlists." })
    })

    it("returns one playlist", async () => {
        state.mode = "ok"
        state.data = { name: "Mix" }
        const result = await getPlaylistAction(1)
        assert.equal(result.ok, true)
        if (result.ok) assert.equal(result.data.name, "Mix")
    })

    it("returns the bot error for one playlist", async () => {
        state.mode = "denied"
        const result = await getPlaylistAction(1)
        assert.deepEqual(result, { ok: false, error: "Not allowed." })
    })

    it("returns the thrown error for one playlist", async () => {
        state.mode = "throw"
        const result = await getPlaylistAction(1)
        assert.deepEqual(result, { ok: false, error: "network down" })
    })

    it("returns the playlist fallback when the throw is not an Error", async () => {
        state.mode = "raw"
        const result = await getPlaylistAction(1)
        assert.deepEqual(result, { ok: false, error: "Failed to load playlist." })
    })

    it("returns the created playlist", async () => {
        state.mode = "ok"
        state.data = { name: "Mix" }
        const result = await createPlaylistAction("Mix")
        assert.equal(result.ok, true)
        if (result.ok) assert.equal(result.data.name, "Mix")
    })

    it("returns the bot error for creating a playlist", async () => {
        state.mode = "denied"
        const result = await createPlaylistAction("Mix")
        assert.deepEqual(result, { ok: false, error: "Not allowed." })
    })

    it("returns the thrown error for creating a playlist", async () => {
        state.mode = "throw"
        const result = await createPlaylistAction("Mix")
        assert.deepEqual(result, { ok: false, error: "network down" })
    })

    it("returns the create fallback when the throw is not an Error", async () => {
        state.mode = "raw"
        const result = await createPlaylistAction("Mix")
        assert.deepEqual(result, { ok: false, error: "Failed to create playlist." })
    })

    it("returns deleted", async () => {
        state.mode = "ok"
        state.data = { deleted: true }
        const result = await deletePlaylistAction(1)
        assert.equal(result.ok, true)
        if (result.ok) assert.equal(result.data.deleted, true)
    })

    it("returns the bot error for deleting a playlist", async () => {
        state.mode = "denied"
        const result = await deletePlaylistAction(1)
        assert.deepEqual(result, { ok: false, error: "Not allowed." })
    })

    it("returns the thrown error for deleting a playlist", async () => {
        state.mode = "throw"
        const result = await deletePlaylistAction(1)
        assert.deepEqual(result, { ok: false, error: "network down" })
    })

    it("returns the delete fallback when the throw is not an Error", async () => {
        state.mode = "raw"
        const result = await deletePlaylistAction(1)
        assert.deepEqual(result, { ok: false, error: "Failed to delete playlist." })
    })

    it("returns the added track", async () => {
        state.mode = "ok"
        state.data = { title: "Song" }
        const result = await addTrackToPlaylistAction(1, track)
        assert.equal(result.ok, true)
        if (result.ok) assert.equal(result.data.title, "Song")
    })

    it("returns the bot error for adding a track", async () => {
        state.mode = "denied"
        const result = await addTrackToPlaylistAction(1, track)
        assert.deepEqual(result, { ok: false, error: "Not allowed." })
    })

    it("returns the thrown error for adding a track", async () => {
        state.mode = "throw"
        const result = await addTrackToPlaylistAction(1, track)
        assert.deepEqual(result, { ok: false, error: "network down" })
    })

    it("returns the add-track fallback when the throw is not an Error", async () => {
        state.mode = "raw"
        const result = await addTrackToPlaylistAction(1, track)
        assert.deepEqual(result, { ok: false, error: "Failed to add track." })
    })

    it("returns removed", async () => {
        state.mode = "ok"
        state.data = { removed: true }
        const result = await removeTrackFromPlaylistAction(1, 4)
        assert.equal(result.ok, true)
        if (result.ok) assert.equal(result.data.removed, true)
    })

    it("returns the bot error for removing a track", async () => {
        state.mode = "denied"
        const result = await removeTrackFromPlaylistAction(1, 4)
        assert.deepEqual(result, { ok: false, error: "Not allowed." })
    })

    it("returns the thrown error for removing a track", async () => {
        state.mode = "throw"
        const result = await removeTrackFromPlaylistAction(1, 4)
        assert.deepEqual(result, { ok: false, error: "network down" })
    })

    it("returns the remove-track fallback when the throw is not an Error", async () => {
        state.mode = "raw"
        const result = await removeTrackFromPlaylistAction(1, 4)
        assert.deepEqual(result, { ok: false, error: "Failed to remove track." })
    })

    it("returns tracks added from a query", async () => {
        state.mode = "ok"
        state.data = { added: 1 }
        const result = await addTrackFromQueryToPlaylistAction(1, { query: "song" })
        assert.equal(result.ok, true)
        if (result.ok) assert.equal(result.data.added, 1)
    })

    it("returns the bot error for adding tracks from a query", async () => {
        state.mode = "denied"
        const result = await addTrackFromQueryToPlaylistAction(1, { query: "song" })
        assert.deepEqual(result, { ok: false, error: "Not allowed." })
    })

    it("returns the thrown error for adding tracks from a query", async () => {
        state.mode = "throw"
        const result = await addTrackFromQueryToPlaylistAction(1, { query: "song" })
        assert.deepEqual(result, { ok: false, error: "network down" })
    })

    it("returns the add-track fallback when a query add throw is not an Error", async () => {
        state.mode = "raw"
        const result = await addTrackFromQueryToPlaylistAction(1, { query: "song" })
        assert.deepEqual(result, { ok: false, error: "Failed to add track." })
    })

    it("returns the playlist after a reorder", async () => {
        state.mode = "ok"
        state.data = { name: "Mix" }
        const result = await movePlaylistTrackAction(1, 1, 2)
        assert.equal(result.ok, true)
        if (result.ok) assert.equal(result.data.name, "Mix")
    })

    it("returns the bot error for a reorder", async () => {
        state.mode = "denied"
        const result = await movePlaylistTrackAction(1, 1, 2)
        assert.deepEqual(result, { ok: false, error: "Not allowed." })
    })

    it("returns the thrown error for a reorder", async () => {
        state.mode = "throw"
        const result = await movePlaylistTrackAction(1, 1, 2)
        assert.deepEqual(result, { ok: false, error: "network down" })
    })

    it("returns the reorder fallback when the throw is not an Error", async () => {
        state.mode = "raw"
        const result = await movePlaylistTrackAction(1, 1, 2)
        assert.deepEqual(result, { ok: false, error: "Failed to reorder track." })
    })

    it("returns the queued playlist", async () => {
        state.mode = "ok"
        state.data = { playlistName: "Mix", queued: 2 }
        const result = await playPlaylistInGuildAction(
            "100000000000000001",
            1,
            "100000000000000002",
            true
        )
        assert.equal(result.ok, true)
        if (result.ok) assert.equal(result.data.queued, 2)
    })

    it("returns the bot error for queueing a playlist", async () => {
        state.mode = "denied"
        const result = await playPlaylistInGuildAction(
            "100000000000000001",
            1,
            "100000000000000002"
        )
        assert.deepEqual(result, { ok: false, error: "Not allowed." })
    })

    it("replaces a playlist play timeout with the dashboard message", async () => {
        state.mode = "timeout"
        const result = await playPlaylistInGuildAction(
            "100000000000000001",
            1,
            "100000000000000002"
        )
        assert.deepEqual(result, {
            ok: false,
            error: "The playlist is still loading on the bot but the dashboard timed out. Check the queue — tracks may appear shortly.",
        })
    })

    it("returns the thrown error for queueing a playlist", async () => {
        state.mode = "throw"
        const result = await playPlaylistInGuildAction(
            "100000000000000001",
            1,
            "100000000000000002"
        )
        assert.deepEqual(result, { ok: false, error: "network down" })
    })

    it("returns the queue-playlist fallback when the throw is not an Error", async () => {
        state.mode = "raw"
        const result = await playPlaylistInGuildAction(
            "100000000000000001",
            1,
            "100000000000000002"
        )
        assert.deepEqual(result, { ok: false, error: "Failed to queue playlist." })
    })
})
