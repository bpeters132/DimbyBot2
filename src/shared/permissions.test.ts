import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"
import {
    WebPermission,
    hasRequiredPermissions,
    invalidatePermissionCache,
    resolveOauthGuildPermissionFallback,
    resolveUserPermissions,
} from "./permissions.js"

type MockVoiceState = { channelId?: string | null; member?: unknown }

/** Minimal Lavalink player shape accepted by `isPlayer` / voice summary. */
function mockLavalinkPlayer(voiceChannelId: string | null, guildId = "guild-1") {
    return {
        guildId,
        voiceChannelId,
        playing: false,
        queue: { tracks: [] as unknown[] },
        get: () => undefined,
    }
}

function mockPermissionClient(opts: {
    guildId: string
    ownerId?: string
    voiceStates?: Map<string, MockVoiceState>
    /** When set (including null), returned from lavalink.getPlayer as an isPlayer-shaped object. */
    playerVoiceChannelId?: string | null
    meVoiceChannelId?: string | null
    memberFetch?: (userId: string) => Promise<unknown>
}) {
    const voiceStates = opts.voiceStates ?? new Map<string, MockVoiceState>()
    return {
        guilds: {
            cache: new Map([
                [
                    opts.guildId,
                    {
                        ownerId: opts.ownerId ?? "owner-1",
                        voiceStates: { cache: voiceStates },
                        members: {
                            me:
                                opts.meVoiceChannelId !== undefined
                                    ? { voice: { channelId: opts.meVoiceChannelId } }
                                    : undefined,
                            fetch:
                                opts.memberFetch ??
                                (async () => {
                                    return null
                                }),
                        },
                    },
                ],
            ]),
        },
        lavalink: {
            getPlayer: (guildId: string) => {
                if (guildId !== opts.guildId) return null
                if (opts.playerVoiceChannelId === undefined) return null
                return mockLavalinkPlayer(opts.playerVoiceChannelId, opts.guildId)
            },
        },
    }
}

afterEach(() => {
    invalidatePermissionCache()
})

describe("hasRequiredPermissions", () => {
    it("allows empty required lists and rejects missing capabilities", () => {
        assert.equal(hasRequiredPermissions([], []), true)
        assert.equal(hasRequiredPermissions([WebPermission.VIEW_PLAYER], []), true)
        assert.equal(
            hasRequiredPermissions(
                [WebPermission.VIEW_PLAYER, WebPermission.MANAGE_QUEUE],
                [WebPermission.VIEW_PLAYER]
            ),
            true
        )
        assert.equal(
            hasRequiredPermissions([WebPermission.VIEW_PLAYER], [WebPermission.CONTROL_PLAYBACK]),
            false
        )
        assert.equal(
            hasRequiredPermissions(
                [WebPermission.VIEW_PLAYER],
                [WebPermission.VIEW_PLAYER, WebPermission.MANAGE_QUEUE]
            ),
            false
        )
    })
})

describe("resolveOauthGuildPermissionFallback", () => {
    const guildId = "guild-1"
    const userId = "user-1"

    it("grants VIEW_PLAYER only when client or guild is missing", () => {
        assert.deepEqual(resolveOauthGuildPermissionFallback(null, guildId, userId), {
            permissions: [WebPermission.VIEW_PLAYER],
            inVoiceWithBot: false,
        })

        const client = mockPermissionClient({ guildId: "other-guild" })
        assert.deepEqual(resolveOauthGuildPermissionFallback(client, guildId, userId), {
            permissions: [WebPermission.VIEW_PLAYER],
            inVoiceWithBot: false,
        })
    })

    it("keeps queue ability when user is in voice and bot is not", () => {
        const client = mockPermissionClient({
            guildId,
            voiceStates: new Map([[userId, { channelId: "vc-user" }]]),
            playerVoiceChannelId: null,
        })
        const result = resolveOauthGuildPermissionFallback(client, guildId, userId)
        assert.equal(result.inVoiceWithBot, false)
        assert.deepEqual(result.permissions, [
            WebPermission.VIEW_PLAYER,
            WebPermission.MANAGE_QUEUE,
        ])
        assert.equal(result.permissions.includes(WebPermission.CONTROL_PLAYBACK), false)
        assert.equal(result.permissions.includes(WebPermission.MANAGE_GUILD_SETTINGS), false)
    })

    it("grants playback and queue when user shares the bot voice channel", () => {
        const client = mockPermissionClient({
            guildId,
            voiceStates: new Map([[userId, { channelId: "vc-1" }]]),
            playerVoiceChannelId: "vc-1",
        })
        const result = resolveOauthGuildPermissionFallback(client, guildId, userId)
        assert.equal(result.inVoiceWithBot, true)
        assert.deepEqual(result.permissions, [
            WebPermission.VIEW_PLAYER,
            WebPermission.CONTROL_PLAYBACK,
            WebPermission.MANAGE_QUEUE,
        ])
    })

    it("strips voice-gated perms when user is in a different voice channel", () => {
        const client = mockPermissionClient({
            guildId,
            voiceStates: new Map([[userId, { channelId: "vc-other" }]]),
            playerVoiceChannelId: "vc-1",
        })
        const result = resolveOauthGuildPermissionFallback(client, guildId, userId)
        assert.equal(result.inVoiceWithBot, false)
        assert.deepEqual(result.permissions, [WebPermission.VIEW_PLAYER])
    })

    it("strips voice-gated perms when user is not in voice", () => {
        const client = mockPermissionClient({
            guildId,
            voiceStates: new Map(),
            playerVoiceChannelId: "vc-1",
        })
        const result = resolveOauthGuildPermissionFallback(client, guildId, userId)
        assert.equal(result.inVoiceWithBot, false)
        assert.deepEqual(result.permissions, [WebPermission.VIEW_PLAYER])
    })
})

describe("resolveUserPermissions", () => {
    const guildId = "guild-1"
    const ownerId = "owner-1"

    it("returns empty permissions when the guild is not cached", async () => {
        const client = mockPermissionClient({ guildId: "other" })
        const result = await resolveUserPermissions(client, guildId, ownerId)
        assert.deepEqual(result, { permissions: [], inVoiceWithBot: false })
    })

    it("grants guild-owner capabilities without member fetch", async () => {
        const client = mockPermissionClient({
            guildId,
            ownerId,
            voiceStates: new Map([[ownerId, { channelId: "vc-1" }]]),
            playerVoiceChannelId: "vc-1",
        })
        const result = await resolveUserPermissions(client, guildId, ownerId)
        assert.equal(result.inVoiceWithBot, true)
        assert.deepEqual(result.permissions, [
            WebPermission.VIEW_PLAYER,
            WebPermission.CONTROL_PLAYBACK,
            WebPermission.MANAGE_QUEUE,
            WebPermission.MANAGE_GUILD_SETTINGS,
            WebPermission.MANAGE_MESSAGES,
        ])
        assert.equal(result.permissions.includes(WebPermission.DEVELOPER_ACCESS), false)
    })

    it("skips voice gating for dashboard entitlement reads", async () => {
        const client = mockPermissionClient({
            guildId,
            ownerId,
            voiceStates: new Map(),
            playerVoiceChannelId: "vc-1",
        })
        const result = await resolveUserPermissions(client, guildId, ownerId, {
            applyVoiceGating: false,
        })
        assert.equal(result.inVoiceWithBot, false)
        assert.deepEqual(result.permissions, [
            WebPermission.VIEW_PLAYER,
            WebPermission.CONTROL_PLAYBACK,
            WebPermission.MANAGE_QUEUE,
            WebPermission.MANAGE_GUILD_SETTINGS,
            WebPermission.MANAGE_MESSAGES,
        ])
    })

    it("returns empty when non-owner member cannot be resolved", async () => {
        const client = mockPermissionClient({
            guildId,
            ownerId,
            memberFetch: async () => null,
        })
        const result = await resolveUserPermissions(client, guildId, "member-2")
        assert.deepEqual(result, { permissions: [], inVoiceWithBot: false })
    })
})

describe("invalidatePermissionCache", () => {
    it("clears cached voice-gated resolutions so later reads recompute", async () => {
        const guildId = "guild-cache"
        const ownerId = "owner-cache"
        const voiceStates = new Map<string, MockVoiceState>([
            [ownerId, { channelId: "vc-1" }],
        ])
        const client = mockPermissionClient({
            guildId,
            ownerId,
            voiceStates,
            playerVoiceChannelId: "vc-1",
        })

        const first = await resolveUserPermissions(client, guildId, ownerId)
        assert.equal(first.inVoiceWithBot, true)
        assert.equal(first.permissions.includes(WebPermission.CONTROL_PLAYBACK), true)

        voiceStates.set(ownerId, { channelId: "vc-other" })
        const stale = await resolveUserPermissions(client, guildId, ownerId)
        assert.equal(stale.inVoiceWithBot, true, "TTL cache should still serve pre-move voice state")

        invalidatePermissionCache(guildId)
        const refreshed = await resolveUserPermissions(client, guildId, ownerId)
        assert.equal(refreshed.inVoiceWithBot, false)
        assert.equal(refreshed.permissions.includes(WebPermission.CONTROL_PLAYBACK), false)
    })
})
