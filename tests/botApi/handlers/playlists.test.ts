import assert from "node:assert/strict"
import { describe, it, mock } from "node:test"

const USER = "100000000000000002"

class PlaylistDuplicateNameError extends Error {
    constructor(name: string) {
        super(`A playlist named "${name}" already exists.`)
        this.name = "PlaylistDuplicateNameError"
    }
}
class PlaylistNotFoundError extends Error {
    constructor() {
        super("Playlist not found.")
        this.name = "PlaylistNotFoundError"
    }
}
class PlaylistTrackNotFoundError extends Error {
    constructor(message: string) {
        super(message)
        this.name = "PlaylistTrackNotFoundError"
    }
}

const now = new Date("2026-01-01T00:00:00.000Z")

function ownedPlaylist(tracks: Array<Record<string, unknown>> = []) {
    return {
        id: 1,
        name: "Mix",
        userId: USER,
        createdAt: now,
        updatedAt: now,
        tracks,
    }
}

const auth = {
    session: {
        ok: true as const,
        session: { user: { id: "u" }, session: { id: "s", expiresAt: "2099-01-01" } },
    } as
        | {
              ok: true
              session: { user: { id: string }; session: { id: string; expiresAt: string } }
          }
        | { ok: false; status: number; error: string; details?: string },
    discordUserId: USER as string | null,
    sessionThrows: false,
}

const repo = {
    list: [{ id: 1, name: "Mix", trackCount: 0, totalDuration: 0, createdAt: now }],
    playlist: ownedPlaylist() as ReturnType<typeof ownedPlaylist> | null,
    listThrows: false,
    createThrows: null as null | "duplicate" | "boom",
    deleteThrows: null as null | "missing" | "boom",
    addThrows: false,
    moveThrows: null as null | "missing" | "boom",
    removeThrows: null as null | "missing" | "boom",
    getThrows: false,
}

const players = new Map<string, { search: (query: string) => Promise<unknown> }>()

mock.module("../../../src/shared/api-auth.js", {
    namedExports: {
        getAuthenticatedSession: async () => {
            if (auth.sessionThrows) throw new Error("session down")
            return auth.session
        },
    },
})

mock.module("../../../src/shared/discord-user-id.js", {
    namedExports: {
        resolveDiscordUserSnowflake: async () => auth.discordUserId,
    },
})

mock.module("../../../src/lib/botClientRegistry.js", {
    namedExports: {
        getBotClient: () => ({ lavalink: { getPlayer: (id: string) => players.get(id), players } }),
        tryGetBotClient: () => null,
    },
})

mock.module("../../../src/repositories/playlistRepository.js", {
    namedExports: {
        PlaylistDuplicateNameError,
        PlaylistNotFoundError,
        PlaylistTrackNotFoundError,
        getUserPlaylists: async () => {
            if (repo.listThrows) throw new Error("db")
            return repo.list
        },
        createPlaylist: async () => {
            if (repo.createThrows === "duplicate") throw new PlaylistDuplicateNameError("Mix")
            if (repo.createThrows === "boom") throw new Error("db")
            return ownedPlaylist()
        },
        getPlaylistById: async () => {
            if (repo.getThrows) throw new Error("db")
            return repo.playlist
        },
        deletePlaylistById: async () => {
            if (repo.deleteThrows === "missing") throw new PlaylistNotFoundError()
            if (repo.deleteThrows === "boom") throw new Error("db")
        },
        addTrackToPlaylist: async () => ({
            id: 4,
            title: "Song",
            uri: "https://example.com/song",
            author: "Artist",
            duration: 10,
            thumbnailUrl: null,
            addedAt: now,
            position: 1,
        }),
        addTracksToPlaylist: async () => [
            {
                id: 4,
                title: "Song",
                uri: "https://example.com/song",
                author: "Artist",
                duration: 10,
                thumbnailUrl: null,
                addedAt: now,
                position: 1,
            },
        ],
        movePlaylistTrack: async () => {
            if (repo.moveThrows === "missing")
                throw new PlaylistTrackNotFoundError("No track at position 9.")
            if (repo.moveThrows === "boom") throw new Error("db")
        },
        removeTrackFromPlaylistById: async () => {
            if (repo.removeThrows === "missing")
                throw new PlaylistTrackNotFoundError("Track not found.")
            if (repo.removeThrows === "boom") throw new Error("db")
        },
    },
})

const {
    playlistsGET,
    playlistsPOST,
    playlistsDetailGET,
    playlistsDELETE,
    playlistTracksPOST,
    playlistTracksFromQueryPOST,
    playlistTrackMovePATCH,
    playlistTracksDELETE,
} = await import("../../../src/botApi/handlers/playlists.js")

const trackBody = {
    title: "Song",
    uri: "https://example.com/song",
    author: "Artist",
    duration: 10,
    addedAt: "2026-01-01T00:00:00.000Z",
}

function details(result: { body: { ok: boolean; error?: { details?: string; error?: string } } }) {
    return result.body.ok ? "" : (result.body.error?.details ?? result.body.error?.error)
}

describe("playlist handlers", () => {
    it("returns the session failure", async () => {
        auth.session = { ok: false, status: 401, error: "Unauthorized" }
        const result = await playlistsGET(new Headers())
        assert.equal(result.status, 401)
        assert.equal(result.body.ok === false && result.body.error.error, "Unauthorized")
        auth.session = {
            ok: true,
            session: { user: { id: "u" }, session: { id: "s", expiresAt: "2099-01-01" } },
        }
    })

    it("returns 403 when the Discord account cannot be resolved", async () => {
        auth.discordUserId = null
        const result = await playlistsGET(new Headers())
        assert.equal(result.status, 403)
        assert.equal(
            result.body.ok === false && result.body.error.error,
            "Discord account required"
        )
        auth.discordUserId = USER
    })

    it("returns 500 when session lookup throws", async () => {
        auth.sessionThrows = true
        const result = await playlistsGET(new Headers())
        assert.equal(result.status, 500)
        assert.equal(result.body.ok === false && result.body.error.error, "internal_error")
        auth.sessionThrows = false
    })

    it("returns the user's playlists", async () => {
        const result = await playlistsGET(new Headers())
        assert.equal(result.status, 200)
        if (result.body.ok) assert.equal(result.body.data.playlists[0]?.name, "Mix")
    })

    it("returns 500 when listing playlists throws", async () => {
        repo.listThrows = true
        const result = await playlistsGET(new Headers())
        assert.equal(result.status, 500)
        assert.equal(details(result), "Internal server error.")
        repo.listThrows = false
    })

    it("returns 400 when create has no JSON body", async () => {
        const result = await playlistsPOST(new Headers(), null)
        assert.equal(result.status, 400)
        assert.equal(details(result), "Expected JSON body with name.")
    })

    it("returns 400 when the playlist name is blank", async () => {
        const result = await playlistsPOST(new Headers(), { name: "  " })
        assert.equal(result.status, 400)
        assert.equal(details(result), "Playlist name is required.")
    })

    it("returns 409 when the playlist name already exists", async () => {
        repo.createThrows = "duplicate"
        const result = await playlistsPOST(new Headers(), { name: "Mix" })
        assert.equal(result.status, 409)
        assert.match(details(result), /already exists/)
        repo.createThrows = null
    })

    it("returns the created playlist", async () => {
        const result = await playlistsPOST(new Headers(), { name: "Mix" })
        assert.equal(result.status, 201)
        if (result.body.ok) assert.equal(result.body.data.name, "Mix")
    })

    it("returns 400 for an invalid playlist id", async () => {
        const result = await playlistsDetailGET(new Headers(), "0")
        assert.equal(result.status, 400)
        assert.equal(details(result), "Invalid playlist id.")
    })

    it("returns 404 when the playlist is missing", async () => {
        repo.playlist = null
        const result = await playlistsDetailGET(new Headers(), "1")
        assert.equal(result.status, 404)
        assert.equal(details(result), "Playlist not found.")
        repo.playlist = ownedPlaylist()
    })

    it("returns 403 when the playlist belongs to someone else", async () => {
        repo.playlist = ownedPlaylist()
        repo.playlist.userId = "100000000000000009"
        const result = await playlistsDetailGET(new Headers(), "1")
        assert.equal(result.status, 403)
        assert.equal(details(result), "You do not own this playlist.")
        repo.playlist = ownedPlaylist()
    })

    it("returns the playlist", async () => {
        const result = await playlistsDetailGET(new Headers(), "1")
        assert.equal(result.status, 200)
        if (result.body.ok) assert.equal(result.body.data.name, "Mix")
    })

    it("returns 404 when delete races a missing playlist", async () => {
        repo.deleteThrows = "missing"
        const result = await playlistsDELETE(new Headers(), "1")
        assert.equal(result.status, 404)
        assert.equal(details(result), "Playlist not found.")
        repo.deleteThrows = null
    })

    it("returns deleted", async () => {
        const result = await playlistsDELETE(new Headers(), "1")
        assert.equal(result.status, 200)
        if (result.body.ok) assert.equal(result.body.data.deleted, true)
    })

    it("returns 400 for an invalid track body", async () => {
        const result = await playlistTracksPOST(new Headers(), "1", {})
        assert.equal(result.status, 400)
        assert.match(details(result), /Invalid track body/)
    })

    it("returns 400 for a blocked track URL", async () => {
        const result = await playlistTracksPOST(new Headers(), "1", {
            ...trackBody,
            uri: "http://127.0.0.1/a",
        })
        assert.equal(result.status, 400)
        assert.equal(details(result), "That URL isn't allowed.")
    })

    it("returns the added track", async () => {
        const result = await playlistTracksPOST(new Headers(), "1", trackBody)
        assert.equal(result.status, 201)
        if (result.body.ok) assert.equal(result.body.data.title, "Song")
    })

    it("returns 400 when a from-query body has no query", async () => {
        const result = await playlistTracksFromQueryPOST(new Headers(), "1", {})
        assert.equal(result.status, 400)
        assert.equal(details(result), "query is required.")
    })

    it("returns 503 when no player can search", async () => {
        players.clear()
        const result = await playlistTracksFromQueryPOST(new Headers(), "1", { query: "song" })
        assert.equal(result.status, 503)
        assert.equal(result.body.ok === false && result.body.error.error, "Search unavailable")
    })

    it("returns 503 when playlist search fails transiently", async () => {
        players.set("guild", {
            search: async () => {
                throw new Error("search down")
            },
        })
        const result = await playlistTracksFromQueryPOST(new Headers(), "1", { query: "song" })
        assert.equal(result.status, 503)
        assert.equal(result.body.ok === false && result.body.error.error, "Search failed")
    })

    it("returns 404 when playlist search finds nothing", async () => {
        players.set("guild", { search: async () => ({ tracks: [] }) })
        const result = await playlistTracksFromQueryPOST(new Headers(), "1", { query: "song" })
        assert.equal(result.status, 404)
        assert.equal(result.body.ok === false && result.body.error.error, "Not found")
    })

    it("returns tracks added from a query", async () => {
        players.set("guild", {
            search: async () => ({
                loadType: "track",
                tracks: [
                    {
                        info: {
                            title: "Song",
                            uri: "https://example.com/song",
                            author: "Artist",
                            duration: 10,
                        },
                    },
                ],
            }),
        })
        const result = await playlistTracksFromQueryPOST(new Headers(), "1", { query: "song" })
        assert.equal(result.status, 201)
        if (result.body.ok) assert.equal(result.body.data.added, 1)
    })

    it("returns 400 when newPosition is missing", async () => {
        const result = await playlistTrackMovePATCH(new Headers(), "1", "1", {})
        assert.equal(result.status, 400)
        assert.equal(details(result), "newPosition must be a positive integer.")
    })

    it("returns 404 when the moved track position does not exist", async () => {
        repo.moveThrows = "missing"
        const result = await playlistTrackMovePATCH(new Headers(), "1", "1", { newPosition: 2 })
        assert.equal(result.status, 404)
        assert.match(details(result), /No track at position/)
        repo.moveThrows = null
    })

    it("returns the playlist after a move", async () => {
        const result = await playlistTrackMovePATCH(new Headers(), "1", "1", { newPosition: 2 })
        assert.equal(result.status, 200)
        if (result.body.ok) assert.equal(result.body.data.id, 1)
    })

    it("returns 400 for an invalid track id", async () => {
        const result = await playlistTracksDELETE(new Headers(), "1", "0")
        assert.equal(result.status, 400)
        assert.equal(details(result), "Invalid track id.")
    })

    it("returns 404 when the track is not in the playlist", async () => {
        repo.playlist = ownedPlaylist([{ id: 4 }])
        const result = await playlistTracksDELETE(new Headers(), "1", "9")
        assert.equal(result.status, 404)
        assert.equal(details(result), "Track not found in this playlist.")
    })

    it("returns removed", async () => {
        repo.playlist = ownedPlaylist([{ id: 9 }])
        const result = await playlistTracksDELETE(new Headers(), "1", "9")
        assert.equal(result.status, 200)
        if (result.body.ok) assert.equal(result.body.data.removed, true)
    })
})
