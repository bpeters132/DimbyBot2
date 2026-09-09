import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
    applyDashboardRequesterFallback,
    composePlayerStateResponse,
    isActivePlayerSession,
    isPlayer,
    resolveBotVoiceChannelId,
    snapshotGuildListPlayer,
    summarizeVoiceForWeb,
} from "./player-state.js"
import { DASHBOARD_REQUESTER_KEY } from "../util/dashboardRequesterSnapshot.js"

function mockPlayer(opts: {
    guildId?: string
    voiceChannelId?: string | null
    playing?: boolean
    paused?: boolean
    tracks?: unknown[]
    current?: { info?: { title?: string; author?: string } } | null
    volume?: number
    position?: number
    repeatMode?: string
    getOverrides?: Record<string, unknown>
}) {
    const getOverrides = opts.getOverrides ?? {}
    return {
        get: (key: string) => getOverrides[key],
        guildId: opts.guildId ?? "guild-1",
        voiceChannelId: opts.voiceChannelId === undefined ? "vc-bot" : opts.voiceChannelId,
        playing: opts.playing ?? false,
        paused: opts.paused ?? false,
        volume: opts.volume ?? 100,
        position: opts.position ?? 0,
        repeatMode: opts.repeatMode ?? "off",
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

describe("isActivePlayerSession", () => {
    it("is false for non-players and empty idle players", () => {
        assert.equal(isActivePlayerSession(null), false)
        assert.equal(isActivePlayerSession({ voiceChannelId: "vc" }), false)
        assert.equal(isActivePlayerSession(mockPlayer({ playing: false, paused: false })), false)
    })

    it("is true when playing, paused, current track, or upcoming queue exists", () => {
        assert.equal(isActivePlayerSession(mockPlayer({ playing: true })), true)
        assert.equal(isActivePlayerSession(mockPlayer({ paused: true })), true)
        assert.equal(
            isActivePlayerSession(mockPlayer({ current: { info: { title: "Song" } } })),
            true
        )
        assert.equal(isActivePlayerSession(mockPlayer({ tracks: [{}] })), true)
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

describe("composePlayerStateResponse", () => {
    it("reports idle without a player and maps playing/paused/loop/autoplay fields", () => {
        assert.deepEqual(composePlayerStateResponse("guild-1", "user-1", null, null), {
            guildId: "guild-1",
            hasPlayer: false,
            status: "idle",
            positionMs: 0,
            loopMode: "off",
            autoplay: false,
            volume: 100,
            queueCount: 0,
            inVoiceWithBot: false,
            botInVoiceChannel: false,
            canQueueTracks: false,
            currentTrack: null,
        })

        const playing = mockPlayer({
            playing: true,
            position: 12_000,
            volume: 40,
            repeatMode: "track",
            tracks: [{}, {}],
            getOverrides: { autoplay: true },
        })
        const track = {
            title: "Song",
            uri: "https://example.com/a",
            durationMs: 1000,
            isStream: false,
            thumbnailUrl: null,
            requesterId: "u1",
            requesterUsername: "Alice",
        }
        const composed = composePlayerStateResponse("guild-1", "user-1", playing as never, track)
        assert.equal(composed.hasPlayer, true)
        assert.equal(composed.status, "playing")
        assert.equal(composed.positionMs, 12_000)
        assert.equal(composed.loopMode, "track")
        assert.equal(composed.autoplay, true)
        assert.equal(composed.volume, 40)
        assert.equal(composed.queueCount, 2)
        assert.equal(composed.currentTrack, track)

        const paused = mockPlayer({ playing: false, paused: true, repeatMode: "queue" })
        assert.equal(
            composePlayerStateResponse("guild-1", "user-1", paused as never, null).status,
            "paused"
        )
        assert.equal(
            composePlayerStateResponse("guild-1", "user-1", paused as never, null).loopMode,
            "queue"
        )
    })
})

describe("applyDashboardRequesterFallback", () => {
    const baseSummary = {
        title: "Song",
        uri: null,
        durationMs: 1000,
        isStream: false,
        thumbnailUrl: null,
        requesterId: null as string | null,
        requesterUsername: null as string | null,
    }

    it("fills missing requester id/username from the dashboard snapshot", () => {
        const player = mockPlayer({
            getOverrides: {
                [DASHBOARD_REQUESTER_KEY]: { id: "dash-1", username: "DashUser" },
            },
        })
        const filled = applyDashboardRequesterFallback(player as never, { ...baseSummary })
        assert.deepEqual(filled, {
            ...baseSummary,
            requesterId: "dash-1",
            requesterUsername: "DashUser",
        })
    })

    it("does not override a different requester id, but fills a blank username for the same id", () => {
        const player = mockPlayer({
            getOverrides: {
                [DASHBOARD_REQUESTER_KEY]: { id: "dash-1", username: "DashUser" },
            },
        })
        assert.deepEqual(
            applyDashboardRequesterFallback(player as never, {
                ...baseSummary,
                requesterId: "other",
                requesterUsername: "Other",
            }),
            {
                ...baseSummary,
                requesterId: "other",
                requesterUsername: "Other",
            }
        )
        assert.deepEqual(
            applyDashboardRequesterFallback(player as never, {
                ...baseSummary,
                requesterId: "dash-1",
                requesterUsername: "   ",
            }),
            {
                ...baseSummary,
                requesterId: "dash-1",
                requesterUsername: "DashUser",
            }
        )
    })

    it("returns the summary unchanged when player or dash snapshot is missing", () => {
        assert.equal(applyDashboardRequesterFallback(null, baseSummary), baseSummary)
        assert.equal(applyDashboardRequesterFallback(mockPlayer({}) as never, null), null)
        assert.deepEqual(
            applyDashboardRequesterFallback(mockPlayer({}) as never, baseSummary),
            baseSummary
        )
    })
})
