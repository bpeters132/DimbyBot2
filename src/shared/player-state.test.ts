import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
    isPlayer,
    resolveBotVoiceChannelId,
    snapshotGuildListPlayer,
    summarizeVoiceForWeb,
} from "./player-state.js"

function mockPlayer(opts: {
    guildId?: string
    voiceChannelId?: string | null
    playing?: boolean
    paused?: boolean
    tracks?: unknown[]
    current?: { info?: { title?: string; author?: string } } | null
}) {
    return {
        get: () => undefined,
        guildId: opts.guildId ?? "guild-1",
        voiceChannelId: opts.voiceChannelId === undefined ? "vc-bot" : opts.voiceChannelId,
        playing: opts.playing ?? false,
        paused: opts.paused ?? false,
        queue: {
            tracks: opts.tracks ?? [],
            current: opts.current ?? null,
        },
    }
}

function mockClient(opts: {
    guildId?: string
    botChannelId?: string | null
    userId?: string
    userChannelId?: string | null
}) {
    const guildId = opts.guildId ?? "guild-1"
    const voiceStates = new Map<string, { channelId?: string | null }>()
    if (opts.userId) {
        voiceStates.set(opts.userId, { channelId: opts.userChannelId ?? null })
    }
    const guild = {
        members: {
            me: { voice: { channelId: opts.botChannelId ?? null } },
        },
        voiceStates: { cache: voiceStates },
    }
    return {
        guilds: {
            cache: new Map([[guildId, guild]]),
        },
    }
}

describe("isPlayer", () => {
    it("accepts a minimal Lavalink-shaped player", () => {
        assert.equal(isPlayer(mockPlayer({})), true)
    })

    it("rejects missing get, queue.tracks, playing, or guildId", () => {
        assert.equal(isPlayer(null), false)
        assert.equal(isPlayer({ queue: { tracks: [] }, playing: false, guildId: "g" }), false)
        assert.equal(
            isPlayer({ get: () => undefined, queue: {}, playing: false, guildId: "g" }),
            false
        )
        assert.equal(
            isPlayer({
                get: () => undefined,
                queue: { tracks: [] },
                playing: "yes",
                guildId: "g",
            }),
            false
        )
        assert.equal(
            isPlayer({
                get: () => undefined,
                queue: { tracks: [] },
                playing: false,
                guildId: 1,
            }),
            false
        )
        assert.equal(
            isPlayer({
                get: () => undefined,
                queue: { tracks: [] },
                playing: false,
                guildId: "g",
                node: null,
            }),
            false
        )
    })
})

describe("resolveBotVoiceChannelId", () => {
    it("prefers Lavalink player.voiceChannelId when set", () => {
        const client = mockClient({ botChannelId: "vc-discord" })
        assert.equal(
            resolveBotVoiceChannelId(
                "guild-1",
                mockPlayer({ voiceChannelId: "vc-lava" }) as never,
                client
            ),
            "vc-lava"
        )
    })

    it("falls back to Discord members.me.voice when player VC is empty", () => {
        const client = mockClient({ botChannelId: "vc-discord" })
        assert.equal(
            resolveBotVoiceChannelId(
                "guild-1",
                mockPlayer({ voiceChannelId: null }) as never,
                client
            ),
            "vc-discord"
        )
        assert.equal(resolveBotVoiceChannelId("guild-1", null, client), "vc-discord")
    })

    it("returns null when neither player nor Discord has a bot VC", () => {
        const client = mockClient({ botChannelId: null })
        assert.equal(resolveBotVoiceChannelId("guild-1", null, client), null)
        assert.equal(resolveBotVoiceChannelId("missing-guild", null, client), null)
    })
})

describe("summarizeVoiceForWeb", () => {
    it("marks inVoiceWithBot only when user and bot share the same VC", () => {
        const client = mockClient({
            userId: "user-1",
            userChannelId: "vc-same",
            botChannelId: "vc-other",
        })
        const player = mockPlayer({ voiceChannelId: "vc-same" })
        assert.deepEqual(summarizeVoiceForWeb("guild-1", "user-1", player, client), {
            inVoiceWithBot: true,
            botInVoiceChannel: true,
            canQueueTracks: true,
        })
    })

    it("allows canQueueTracks when user is in voice and bot is not", () => {
        const client = mockClient({
            userId: "user-1",
            userChannelId: "vc-user",
            botChannelId: null,
        })
        assert.deepEqual(summarizeVoiceForWeb("guild-1", "user-1", null, client), {
            inVoiceWithBot: false,
            botInVoiceChannel: false,
            canQueueTracks: true,
        })
    })

    it("blocks canQueueTracks when user is in a different VC than the bot", () => {
        const client = mockClient({
            userId: "user-1",
            userChannelId: "vc-user",
            botChannelId: "vc-bot",
        })
        const player = mockPlayer({ voiceChannelId: "vc-bot" })
        assert.deepEqual(summarizeVoiceForWeb("guild-1", "user-1", player, client), {
            inVoiceWithBot: false,
            botInVoiceChannel: true,
            canQueueTracks: false,
        })
    })

    it("blocks queueing when the user is not in any voice channel", () => {
        const client = mockClient({
            userId: "user-1",
            userChannelId: null,
            botChannelId: "vc-bot",
        })
        const player = mockPlayer({ voiceChannelId: "vc-bot" })
        assert.deepEqual(summarizeVoiceForWeb("guild-1", "user-1", player, client), {
            inVoiceWithBot: false,
            botInVoiceChannel: true,
            canQueueTracks: false,
        })
    })

    it("ignores non-player shapes for bot VC and falls back to Discord", () => {
        const client = mockClient({
            userId: "user-1",
            userChannelId: "vc-discord",
            botChannelId: "vc-discord",
        })
        assert.deepEqual(
            summarizeVoiceForWeb("guild-1", "user-1", { voiceChannelId: "vc-ignored" }, client),
            {
                inVoiceWithBot: true,
                botInVoiceChannel: true,
                canQueueTracks: true,
            }
        )
    })
})

describe("snapshotGuildListPlayer", () => {
    it("returns null when there is no player and the bot is not in voice", () => {
        const client = mockClient({ botChannelId: null })
        assert.equal(snapshotGuildListPlayer("guild-1", "user-1", null, client), null)
    })

    it("reports idle bot-in-voice without a player, and clears inVoiceWithBot without discordUserId", () => {
        const client = mockClient({
            userId: "user-1",
            userChannelId: "vc-bot",
            botChannelId: "vc-bot",
        })
        assert.deepEqual(snapshotGuildListPlayer("guild-1", undefined, null, client), {
            status: "idle",
            botInVoiceChannel: true,
            inVoiceWithBot: false,
            currentTrackTitle: null,
            currentTrackAuthor: null,
            queueCount: 0,
        })
    })

    it("surfaces playing status and current track fields from a valid player", () => {
        const client = mockClient({
            userId: "user-1",
            userChannelId: "vc-bot",
            botChannelId: "vc-bot",
        })
        const player = mockPlayer({
            voiceChannelId: "vc-bot",
            playing: true,
            tracks: [{}, {}],
            current: { info: { title: "Song", author: "Artist" } },
        })
        assert.deepEqual(snapshotGuildListPlayer("guild-1", "user-1", player, client), {
            status: "playing",
            botInVoiceChannel: true,
            inVoiceWithBot: true,
            currentTrackTitle: "Song",
            currentTrackAuthor: "Artist",
            queueCount: 2,
        })
    })
})
