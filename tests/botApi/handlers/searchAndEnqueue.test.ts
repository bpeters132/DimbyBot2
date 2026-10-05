import assert from "node:assert/strict"
import { describe, it, mock } from "node:test"
import type { SearchAndEnqueueGuard } from "../../../src/botApi/handlers/searchAndEnqueue.js"

const GUILD = "100000000000000001"
const USER = "100000000000000002"

const enqueueMode = { value: "ok" as "ok" | "no_player" | "throw" }

mock.module("../../../src/botApi/handlers/enqueueSearchTracks.js", {
    namedExports: {
        enqueueSearchTracksAssumingSearchDone: async (getLive: () => unknown) => {
            if (enqueueMode.value === "throw") throw new Error("yt down")
            if (enqueueMode.value === "no_player") return { status: "no_player" }
            return { status: "ok", player: getLive(), playbackStarted: true }
        },
    },
})

const { searchAndEnqueue } = await import("../../../src/botApi/handlers/searchAndEnqueue.js")

function member(inVoice: boolean) {
    return {
        id: USER,
        voice: { channel: inVoice ? voiceChannel() : null },
        user: { username: "Ada", globalName: "Ada" },
    }
}

function voiceChannel() {
    return {
        id: "voice-1",
        isTextBased: () => false,
        isDMBased: () => false,
        permissionsFor: () => ({ has: () => true }),
    }
}

function createClient(
    options: {
        guild?: boolean
        player?: Record<string, unknown> | null
        user?: { id: string } | null
        fetch?: () => Promise<unknown>
        createPlayer?: () => Promise<unknown>
    } = {}
) {
    const player = options.player === undefined ? connectedPlayer() : options.player
    const guild = {
        id: GUILD,
        members: {
            me: { voice: { channelId: null as string | null } },
            fetch: options.fetch ?? (async () => member(true)),
        },
        channels: { cache: new Map(), fetch: async () => null },
        systemChannel: null,
        systemChannelId: null,
    }
    const players = new Map<string, unknown>()
    if (player) players.set(GUILD, player)
    return {
        user: options.user === undefined ? { id: "bot-1" } : options.user,
        error() {},
        debug() {},
        warn() {},
        info() {},
        guilds: { cache: options.guild === false ? new Map() : new Map([[GUILD, guild]]) },
        channels: { cache: new Map() },
        lavalink: {
            players,
            getPlayer: (id: string) => players.get(id),
            createPlayer: options.createPlayer ?? (async () => player),
            destroyPlayer: async () => undefined,
            on() {},
            off() {},
        },
        guild,
    }
}

function connectedPlayer() {
    return {
        guildId: GUILD,
        connected: true,
        voiceChannelId: "voice-1",
        textChannelId: null as string | null,
        queue: { current: null, tracks: [] as unknown[] },
        async connect() {},
        async search() {
            return {
                loadType: "track",
                tracks: [{ info: { title: "Song", uri: "https://example.com/s" } }],
            }
        },
    }
}

const guard = {
    session: {
        user: { id: USER, name: "Ada" },
        session: { id: "s", expiresAt: "2099-01-01" },
    },
} as SearchAndEnqueueGuard

describe("searchAndEnqueue", () => {
    it("rejects a private media URL", async () => {
        const result = await searchAndEnqueue(
            createClient() as never,
            GUILD,
            USER,
            "http://127.0.0.1/a",
            guard
        )
        assert.equal(result.ok, false)
        if (result.ok) return
        assert.equal(result.status, 400)
        assert.equal(result.error.error, "That URL isn't allowed.")
    })

    it("returns 404 when the guild is not cached", async () => {
        const result = await searchAndEnqueue(
            createClient({ guild: false }) as never,
            GUILD,
            USER,
            "song",
            guard
        )
        assert.equal(result.ok, false)
        if (result.ok) return
        assert.equal(result.status, 404)
        assert.equal(result.error.error, "Guild not found in bot cache.")
    })

    it("returns 503 when the member fetch fails transiently", async () => {
        const client = createClient({
            fetch: async () => {
                throw new Error("discord down")
            },
        })
        const result = await searchAndEnqueue(client as never, GUILD, USER, "song", guard)
        assert.equal(result.ok, false)
        if (result.ok) return
        assert.equal(result.status, 503)
        assert.equal(result.error.error, "Unable to verify voice state, please try again.")
    })

    it("returns 400 when the requester is not in voice", async () => {
        const client = createClient({ fetch: async () => member(false) })
        const result = await searchAndEnqueue(client as never, GUILD, USER, "song", guard)
        assert.equal(result.ok, false)
        if (result.ok) return
        assert.equal(result.status, 400)
        assert.equal(result.error.error, "Join a voice channel first.")
    })

    it("returns 503 when the bot user is missing", async () => {
        const result = await searchAndEnqueue(
            createClient({ user: null }) as never,
            GUILD,
            USER,
            "song",
            guard
        )
        assert.equal(result.ok, false)
        if (result.ok) return
        assert.equal(result.status, 503)
        assert.equal(result.error.error, "Bot not ready; cannot verify voice permissions.")
    })

    it("returns 403 when voice permissions cannot be read", async () => {
        const channel = voiceChannel()
        channel.permissionsFor = () => null as never
        const client = createClient({
            fetch: async () => ({ ...member(true), voice: { channel } }),
        })
        const result = await searchAndEnqueue(client as never, GUILD, USER, "song", guard)
        assert.equal(result.ok, false)
        if (result.ok) return
        assert.equal(result.status, 403)
        assert.equal(
            result.error.error,
            "Could not determine bot permissions for this voice channel."
        )
    })

    it("returns 403 when the bot cannot join the voice channel", async () => {
        const channel = voiceChannel()
        channel.permissionsFor = () => ({ has: () => false })
        const client = createClient({
            fetch: async () => ({ ...member(true), voice: { channel } }),
        })
        const result = await searchAndEnqueue(client as never, GUILD, USER, "song", guard)
        assert.equal(result.ok, false)
        if (result.ok) return
        assert.equal(result.status, 403)
        assert.equal(result.error.error, "Bot lacks permission to join this voice channel.")
    })

    it("returns 403 when the bot is in a different voice channel", async () => {
        const client = createClient()
        client.guild.members.me.voice.channelId = "voice-2"
        const result = await searchAndEnqueue(client as never, GUILD, USER, "song", guard)
        assert.equal(result.ok, false)
        if (result.ok) return
        assert.equal(result.status, 403)
        assert.equal(result.error.error, "You need to be in the same voice channel as the bot.")
    })

    it("returns 503 when the player cannot be created", async () => {
        const client = createClient({
            player: null,
            createPlayer: async () => {
                throw new Error("no node")
            },
        })
        const result = await searchAndEnqueue(client as never, GUILD, USER, "song", guard)
        assert.equal(result.ok, false)
        if (result.ok) return
        assert.equal(result.status, 503)
        assert.equal(result.error.error, "Could not create the player.")
    })

    it("returns 503 when the player cannot connect", async () => {
        const player = connectedPlayer()
        player.connected = false
        player.connect = async () => {
            throw new Error("voice down")
        }
        const client = createClient({ player })
        const result = await searchAndEnqueue(client as never, GUILD, USER, "song", guard)
        assert.equal(result.ok, false)
        if (result.ok) return
        assert.equal(result.status, 503)
        assert.equal(result.error.error, "Could not connect the player to your voice channel.")
    })

    it("returns 503 when search throws", async () => {
        const player = connectedPlayer()
        player.search = async () => {
            throw new Error("search down")
        }
        const result = await searchAndEnqueue(
            createClient({ player }) as never,
            GUILD,
            USER,
            "song",
            guard
        )
        assert.equal(result.ok, false)
        if (result.ok) return
        assert.equal(result.status, 503)
        assert.equal(result.error.error, "Search failed.")
    })

    it("returns 404 when search has no matches", async () => {
        const player = connectedPlayer()
        player.search = async () => ({ loadType: "empty", tracks: [] })
        const result = await searchAndEnqueue(
            createClient({ player }) as never,
            GUILD,
            USER,
            "song",
            guard
        )
        assert.equal(result.ok, false)
        if (result.ok) return
        assert.equal(result.status, 404)
        assert.equal(result.error.error, "No matches found.")
    })

    it("returns 503 when YouTube playback cannot be resolved", async () => {
        enqueueMode.value = "throw"
        const result = await searchAndEnqueue(createClient() as never, GUILD, USER, "song", guard)
        assert.equal(result.ok, false)
        if (result.ok) return
        assert.equal(result.status, 503)
        assert.equal(result.error.error, "Could not resolve YouTube playback.")
        enqueueMode.value = "ok"
    })

    it("returns 409 when the player is replaced during enqueue", async () => {
        enqueueMode.value = "no_player"
        const result = await searchAndEnqueue(createClient() as never, GUILD, USER, "song", guard)
        assert.equal(result.ok, false)
        if (result.ok) return
        assert.equal(result.status, 409)
        assert.equal(
            result.error.error,
            "Player stopped before the track could be queued. Try again."
        )
        enqueueMode.value = "ok"
    })

    it("returns the connected player after enqueue", async () => {
        const result = await searchAndEnqueue(createClient() as never, GUILD, USER, "song", guard)
        assert.equal(result.ok, true)
        if (result.ok) assert.equal(result.playbackStarted, true)
    })
})
