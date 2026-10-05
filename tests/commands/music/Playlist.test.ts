import assert from "node:assert/strict"
import { registerHooks } from "node:module"
import { beforeEach, describe, it } from "node:test"
import { setPlayerSessionPersistenceDbForTests } from "../../../src/util/playerSessionPersistence.js"
import {
    createBotClientFake,
    createSlashInteraction,
    messageContents,
    type FakeBotClient,
    type FakeInteractionInput,
    type RecordedMessage,
} from "../../test-support/commandFakes.js"

setPlayerSessionPersistenceDbForTests({
    upsertPlayerSession: async () => undefined,
    deletePlayerSession: async () => undefined,
})

type StoredTrack = {
    id: number
    title: string
    uri: string
    author: string
    duration: number
    thumbnailUrl: string | null
    addedAt: Date
    position: number
}

type StoredPlaylist = {
    id: number
    name: string
    tracks: StoredTrack[]
}

const db = {
    nextPlaylistId: 1,
    nextTrackId: 1,
    rows: [] as StoredPlaylist[],
    fail: null as null | "get" | "create" | "list" | "delete" | "add" | "remove",
}

function resetDb() {
    db.nextPlaylistId = 1
    db.nextTrackId = 1
    db.rows = []
    db.fail = null
}

function seedPlaylist(
    name: string,
    tracks: Array<{ title: string; uri: string; duration?: number }> = []
) {
    const row: StoredPlaylist = {
        id: db.nextPlaylistId++,
        name,
        tracks: tracks.map((track, index) => ({
            id: db.nextTrackId++,
            title: track.title,
            uri: track.uri,
            author: "Artist",
            duration: track.duration ?? 0,
            thumbnailUrl: null,
            addedAt: new Date(0),
            position: index + 1,
        })),
    }
    db.rows.push(row)
    return row
}

const repo = {
    async getPlaylist(_userId: string, name: string) {
        if (db.fail === "get") throw new Error("db down")
        return db.rows.find((row) => row.name === name) ?? null
    },
    async createPlaylist(_userId: string, name: string) {
        if (db.fail === "create") throw new Error("db down")
        return seedPlaylist(name)
    },
    async deletePlaylistById(_userId: string, playlistId: number) {
        if (db.fail === "delete") throw new Error("db down")
        db.rows = db.rows.filter((row) => row.id !== playlistId)
    },
    async getUserPlaylists() {
        if (db.fail === "list") throw new Error("db down")
        return db.rows.map((row) => ({ name: row.name, trackCount: row.tracks.length }))
    },
    async addTracksToPlaylist(playlistId: number, tracks: Array<Record<string, unknown>>) {
        if (db.fail === "add") throw new Error("db down")
        const playlist = db.rows.find((row) => row.id === playlistId)
        if (!playlist) throw new Error("missing playlist")
        return tracks.map((track) => {
            const row: StoredTrack = {
                id: db.nextTrackId++,
                title: String(track.title),
                uri: String(track.uri),
                author: String(track.author ?? "Unknown"),
                duration: Number(track.duration ?? 0),
                thumbnailUrl: (track.thumbnailUrl as string | null) ?? null,
                addedAt: track.addedAt instanceof Date ? track.addedAt : new Date(),
                position: playlist.tracks.length + 1,
            }
            playlist.tracks.push(row)
            return row
        })
    },
    async removeTrackFromPlaylistById(playlistId: number, trackId: number) {
        if (db.fail === "remove") throw new Error("db down")
        const playlist = db.rows.find((row) => row.id === playlistId)
        if (!playlist) return
        playlist.tracks = playlist.tracks.filter((track) => track.id !== trackId)
    },
}

const repoGlobal = globalThis as { __dimbyPlaylistRepo?: typeof repo }
repoGlobal.__dimbyPlaylistRepo = repo

registerHooks({
    load(url, context, nextLoad) {
        if (url.replaceAll("\\", "/").includes("/src/repositories/playlistRepository.ts")) {
            return {
                format: "module",
                shortCircuit: true,
                source: `
                    const repo = globalThis.__dimbyPlaylistRepo
                    export const getPlaylist = (...args) => repo.getPlaylist(...args)
                    export const createPlaylist = (...args) => repo.createPlaylist(...args)
                    export const deletePlaylistById = (...args) => repo.deletePlaylistById(...args)
                    export const getUserPlaylists = (...args) => repo.getUserPlaylists(...args)
                    export const addTracksToPlaylist = (...args) => repo.addTracksToPlaylist(...args)
                    export const removeTrackFromPlaylistById = (...args) => repo.removeTrackFromPlaylistById(...args)
                `,
            }
        }
        return nextLoad(url, context)
    },
})

const { default: playlistCommand } = await import("../../../src/commands/music/Playlist.js")

function idleGuild() {
    return { id: "guild-1", members: { me: null } } as { id: string }
}

function firstEmbed(calls: RecordedMessage[]) {
    const embeds = calls.find((call) => call.embeds && call.embeds.length > 0)?.embeds
    const embed = embeds?.[0] as { toJSON: () => Record<string, unknown> }
    return embed.toJSON() as {
        title?: string
        description?: string
        fields?: Array<{ name?: string; value?: string }>
    }
}

function putPlayer(client: FakeBotClient, player: unknown) {
    ;(client.lavalink.players as unknown as Map<string, unknown>).set("guild-1", player)
}

async function executePlaylist(
    input: FakeInteractionInput,
    prepare?: (client: FakeBotClient) => void
) {
    const { interaction, calls } = createSlashInteraction({
        guild: idleGuild(),
        ...input,
        options: { ...input.options },
    })
    const client = createBotClientFake()
    prepare?.(client)
    await playlistCommand.execute(interaction, client)
    return calls
}

function searchHit(title: string, uri: string) {
    return {
        info: {
            title,
            uri,
            author: "Artist",
            duration: 1000,
            sourceName: "http",
        },
    }
}

function queuePlayer() {
    return {
        guildId: "guild-1",
        connected: false,
        playing: true,
        voiceChannelId: "voice-1",
        get: () => false,
        queue: {
            tracks: [] as unknown[],
            current: null as unknown,
            add: async () => undefined,
        },
    }
}

describe("playlist replies", () => {
    beforeEach(() => {
        resetDb()
    })

    it("tells you to use the command in a server", async () => {
        const calls = await executePlaylist({ guild: null, subcommand: "list" })
        assert.deepEqual(messageContents(calls), ["Use this command in a server."])
    })

    it("tells you when your member profile cannot be resolved", async () => {
        const calls = await executePlaylist({ inCachedGuild: false, subcommand: "list" })
        assert.deepEqual(messageContents(calls), [
            "Could not resolve your member profile. Try again.",
        ])
    })

    it("refuses to create a playlist you already have", async () => {
        seedPlaylist("Favorites")
        const calls = await executePlaylist({
            subcommand: "create",
            options: { name: "Favorites" },
        })
        assert.deepEqual(messageContents(calls), [
            "You already have a playlist named **Favorites**.",
        ])
    })

    it("confirms a new playlist", async () => {
        const calls = await executePlaylist({
            subcommand: "create",
            options: { name: "Favorites" },
        })
        assert.deepEqual(messageContents(calls), ["Created playlist **Favorites**."])
    })

    it("tells you when the playlist to delete is missing", async () => {
        const calls = await executePlaylist({
            subcommand: "delete",
            options: { name: "Favorites" },
        })
        assert.deepEqual(messageContents(calls), ["No playlist named **Favorites** found."])
    })

    it("confirms a deleted playlist", async () => {
        seedPlaylist("Favorites")
        const calls = await executePlaylist({
            subcommand: "delete",
            options: { name: "Favorites" },
        })
        assert.deepEqual(messageContents(calls), ["Deleted playlist **Favorites**."])
    })

    it("tells you when you have no playlists", async () => {
        const calls = await executePlaylist({ subcommand: "list" })
        assert.deepEqual(messageContents(calls), [
            "You don't have any playlists yet. Use `/playlist create` to make one!",
        ])
    })

    it("lists one playlist with a singular track count", async () => {
        seedPlaylist("Favorites", [{ title: "Song", uri: "https://example.com/song" }])
        const calls = await executePlaylist({ subcommand: "list" })
        const embed = firstEmbed(calls)
        assert.equal(embed.title, "Your Playlists")
        assert.equal(embed.description, "**Favorites** — 1 track")
    })

    it("lists a playlist with a plural track count", async () => {
        seedPlaylist("Mix", [
            { title: "One", uri: "https://example.com/one" },
            { title: "Two", uri: "https://example.com/two" },
        ])
        const calls = await executePlaylist({ subcommand: "list" })
        assert.equal(firstEmbed(calls).description, "**Mix** — 2 tracks")
    })

    it("shows an empty playlist", async () => {
        seedPlaylist("Favorites")
        const calls = await executePlaylist({
            subcommand: "view",
            options: { name: "Favorites" },
        })
        const embed = firstEmbed(calls)
        assert.equal(embed.title, "Playlist: Favorites")
        assert.equal(embed.description, "**Total Duration:** `00:00`")
        assert.equal(embed.fields?.[0]?.value, "_This playlist is empty._")
    })

    it("shows tracks in a playlist", async () => {
        seedPlaylist("Favorites", [
            { title: "Song", uri: "https://example.com/song", duration: 3000 },
        ])
        const calls = await executePlaylist({
            subcommand: "view",
            options: { name: "Favorites" },
        })
        const embed = firstEmbed(calls)
        assert.equal(embed.description, "**Total Duration:** `00:03`")
        assert.equal(embed.fields?.[0]?.value, "**1.** [Song](https://example.com/song) - `00:03`")
    })

    it("tells you when no player can search for a playlist add", async () => {
        seedPlaylist("Favorites")
        const calls = await executePlaylist({
            subcommand: "add",
            options: { name: "Favorites", query: "song" },
        })
        assert.deepEqual(messageContents(calls), [
            "The bot is not in a voice channel anywhere. Join voice in a server with the bot, or try again later.",
        ])
    })

    it("returns the search error when adding by query fails", async () => {
        seedPlaylist("Favorites")
        const calls = await executePlaylist(
            { subcommand: "add", options: { name: "Favorites", query: "song" } },
            (client) => {
                putPlayer(client, {
                    search: async () => {
                        throw new Error("lavalink down")
                    },
                })
            }
        )
        assert.deepEqual(messageContents(calls), ["Search failed."])
    })

    it("tells you when a playlist search finds nothing", async () => {
        seedPlaylist("Favorites")
        const calls = await executePlaylist(
            { subcommand: "add", options: { name: "Favorites", query: "song" } },
            (client) => {
                putPlayer(client, {
                    search: async () => ({ loadType: "empty", tracks: [] }),
                })
            }
        )
        assert.deepEqual(messageContents(calls), ["No tracks found."])
    })

    it("confirms one searched track was added", async () => {
        seedPlaylist("Favorites")
        const calls = await executePlaylist(
            { subcommand: "add", options: { name: "Favorites", query: "song" } },
            (client) => {
                putPlayer(client, {
                    search: async () => ({
                        loadType: "track",
                        tracks: [searchHit("Song", "https://example.com/song")],
                    }),
                })
            }
        )
        assert.deepEqual(messageContents(calls), [
            "Added **[Song](https://example.com/song)** to **Favorites**.",
        ])
    })

    it("confirms several searched tracks were added", async () => {
        seedPlaylist("Favorites")
        const calls = await executePlaylist(
            { subcommand: "add", options: { name: "Favorites", query: "mix" } },
            (client) => {
                putPlayer(client, {
                    search: async () => ({
                        loadType: "playlist",
                        tracks: [
                            searchHit("One", "https://example.com/one"),
                            searchHit("Two", "https://example.com/two"),
                        ],
                    }),
                })
            }
        )
        assert.deepEqual(messageContents(calls), ["Added **2** tracks to **Favorites**."])
    })

    it("asks for a query when nothing is playing", async () => {
        seedPlaylist("Favorites")
        const calls = await executePlaylist({
            subcommand: "add",
            options: { name: "Favorites" },
        })
        assert.deepEqual(messageContents(calls), [
            "Nothing is playing. Provide a `query` or start playback first.",
        ])
    })

    it("refuses to save a current track that has no URL", async () => {
        seedPlaylist("Favorites")
        const calls = await executePlaylist(
            { subcommand: "add", options: { name: "Favorites" } },
            (client) => {
                putPlayer(client, {
                    queue: { current: { info: { title: "Live", uri: "   " } } },
                })
            }
        )
        assert.deepEqual(messageContents(calls), [
            "The current track has no URL and cannot be saved to a playlist.",
        ])
    })

    it("saves the current track", async () => {
        seedPlaylist("Favorites")
        const calls = await executePlaylist(
            { subcommand: "add", options: { name: "Favorites" } },
            (client) => {
                putPlayer(client, {
                    queue: {
                        current: {
                            info: {
                                title: "Live Song",
                                uri: "https://example.com/live",
                                author: "Band",
                                duration: 1000,
                            },
                        },
                    },
                })
            }
        )
        assert.deepEqual(messageContents(calls), [
            "Added **[Live Song](https://example.com/live)** to **Favorites**.",
        ])
    })

    it("rejects a track index outside the playlist", async () => {
        seedPlaylist("Favorites", [{ title: "Song", uri: "https://example.com/song" }])
        const calls = await executePlaylist({
            subcommand: "remove",
            options: { name: "Favorites", index: 2 },
        })
        assert.deepEqual(messageContents(calls), ["Invalid index. Choose between 1 and 1."])
    })

    it("confirms a removed track", async () => {
        seedPlaylist("Favorites", [{ title: "Song", uri: "https://example.com/song" }])
        const calls = await executePlaylist({
            subcommand: "remove",
            options: { name: "Favorites", index: 1 },
        })
        assert.deepEqual(messageContents(calls), ["Removed **Song** from **Favorites**."])
    })

    it("tells you to join voice before playing a playlist", async () => {
        const calls = await executePlaylist({
            subcommand: "play",
            options: { name: "Favorites" },
            member: { voice: { channel: null } },
        })
        assert.deepEqual(messageContents(calls), ["Join a voice channel first!"])
    })

    it("tells you when the playlist to play is missing", async () => {
        const calls = await executePlaylist({
            subcommand: "play",
            options: { name: "Favorites" },
        })
        assert.deepEqual(messageContents(calls), ["No playlist named **Favorites** found."])
    })

    it("tells you when the playlist has no tracks", async () => {
        seedPlaylist("Favorites")
        const calls = await executePlaylist({
            subcommand: "play",
            options: { name: "Favorites" },
        })
        assert.deepEqual(messageContents(calls), ["**Favorites** has no tracks."])
    })

    it("denies playlist play when the bot is in another voice channel", async () => {
        seedPlaylist("Favorites", [{ title: "Song", uri: "https://example.com/song" }])
        const calls = await executePlaylist(
            { subcommand: "play", options: { name: "Favorites" } },
            (client) => {
                const player = queuePlayer()
                player.voiceChannelId = "voice-2"
                putPlayer(client, player)
            }
        )
        assert.deepEqual(messageContents(calls), [
            "You need to be in the same voice channel as the bot!",
        ])
    })

    it("tells you when no stored tracks can be resolved", async () => {
        seedPlaylist("Favorites", [{ title: "Secret", uri: "http://localhost/secret.mp3" }])
        const calls = await executePlaylist(
            { subcommand: "play", options: { name: "Favorites" } },
            (client) => {
                putPlayer(client, queuePlayer())
            }
        )
        assert.deepEqual(messageContents(calls), [
            "Could not resolve any tracks from **Favorites**.",
        ])
    })

    it("tells you when the player stops before the playlist is queued", async () => {
        seedPlaylist("Favorites", [{ title: "Song", uri: "https://example.com/song" }])
        const calls = await executePlaylist(
            { subcommand: "play", options: { name: "Favorites" } },
            (client) => {
                const player = queuePlayer()
                let reads = 0
                putPlayer(client, player)
                const lavalink = client.lavalink as unknown as {
                    getPlayer: (guildId: string) => unknown
                }
                lavalink.getPlayer = (guildId: string) => {
                    reads += 1
                    return reads < 3 ? client.lavalink.players.get(guildId) : { id: "successor" }
                }
            }
        )
        assert.deepEqual(messageContents(calls), [
            "The player stopped before the playlist could be queued. Try again.",
        ])
    })

    it("queues one track", async () => {
        seedPlaylist("Favorites", [{ title: "Song", uri: "https://example.com/song" }])
        const calls = await executePlaylist(
            { subcommand: "play", options: { name: "Favorites" } },
            (client) => {
                putPlayer(client, queuePlayer())
            }
        )
        assert.deepEqual(messageContents(calls), ["Queued 1 track from **Favorites**."])
    })

    it("queues several tracks", async () => {
        seedPlaylist("Favorites", [
            { title: "One", uri: "https://example.com/one" },
            { title: "Two", uri: "https://example.com/two" },
        ])
        const calls = await executePlaylist(
            { subcommand: "play", options: { name: "Favorites" } },
            (client) => {
                putPlayer(client, queuePlayer())
            }
        )
        assert.deepEqual(messageContents(calls), ["Queued 2 tracks from **Favorites**."])
    })

    it("reports one unresolved track", async () => {
        seedPlaylist("Favorites", [
            { title: "Song", uri: "https://example.com/song" },
            { title: "Secret", uri: "http://127.0.0.1/nope.mp3" },
        ])
        const calls = await executePlaylist(
            { subcommand: "play", options: { name: "Favorites" } },
            (client) => {
                putPlayer(client, queuePlayer())
            }
        )
        assert.deepEqual(messageContents(calls), [
            "Queued 1 track from **Favorites**. 1 track could not be resolved.",
        ])
    })

    it("reports several unresolved tracks", async () => {
        seedPlaylist("Favorites", [
            { title: "One", uri: "https://example.com/one" },
            { title: "Two", uri: "https://example.com/two" },
            { title: "Secret", uri: "http://localhost/a.mp3" },
            { title: "Local", uri: "http://127.0.0.1/b.mp3" },
        ])
        const calls = await executePlaylist(
            { subcommand: "play", options: { name: "Favorites" } },
            (client) => {
                putPlayer(client, queuePlayer())
            }
        )
        assert.deepEqual(messageContents(calls), [
            "Queued 2 tracks from **Favorites**. 2 tracks could not be resolved.",
        ])
    })

    it("rejects an unknown subcommand", async () => {
        const calls = await executePlaylist({ subcommand: "nope" })
        assert.deepEqual(messageContents(calls), ["Unknown subcommand."])
    })

    it("reports a processing error before a reply was sent", async () => {
        db.fail = "get"
        const originalError = console.error
        console.error = () => undefined
        try {
            const calls = await executePlaylist({
                subcommand: "create",
                options: { name: "Favorites" },
            })
            assert.deepEqual(messageContents(calls), [
                "An error occurred while processing your request.",
            ])
        } finally {
            console.error = originalError
        }
    })

    it("reports a processing error after the reply was deferred", async () => {
        db.fail = "get"
        const originalError = console.error
        console.error = () => undefined
        try {
            const calls = await executePlaylist({
                subcommand: "play",
                options: { name: "Favorites" },
            })
            assert.deepEqual(messageContents(calls), [
                "An error occurred while processing your request.",
            ])
        } finally {
            console.error = originalError
        }
    })
})
