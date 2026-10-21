import assert from "node:assert/strict"
import { before, describe, it, mock } from "node:test"
import { WebPermission } from "../../../src/shared/permissions.js"

const USER = "100000000000000002"
const GUILD = "100000000000000001"

const state = {
    guard: {
        ok: true as const,
        discordUserId: USER,
        session: { user: { id: "u", name: "Ada" }, session: { id: "s", expiresAt: "2099-01-01" } },
        permissionResolution: {},
    } as
        | {
              ok: true
              discordUserId: string
              session: {
                  user: { id: string; name?: string }
                  session: { id: string; expiresAt: string }
              }
              permissionResolution: object
          }
        | { ok: false; status: number; error: string; details?: string },
    player: null as null | Record<string, unknown>,
    getPlayerThrows: false,
    skip: "skipped" as "skipped" | "stale" | "deferred" | "throw",
    lastPermissions: [] as WebPermission[],
    broadcasts: [] as string[],
}

function basePlayer(extra: Record<string, unknown> = {}) {
    return {
        guildId: GUILD,
        playing: true,
        paused: false,
        connected: true,
        position: 0,
        repeatMode: "off",
        volume: 100,
        voiceChannelId: "voice-1",
        queue: { current: null, tracks: [] as unknown[], async shuffle() {}, async splice() {} },
        get: () => false,
        set() {},
        async pause() {},
        async resume() {},
        async seek() {},
        async setRepeatMode() {},
        async destroy() {},
        ...extra,
    }
}

mock.module("../../../src/shared/api-auth.js", {
    namedExports: {
        requirePermissions: async (
            _headers: Headers,
            _guildId: string,
            permissions: WebPermission[]
        ) => {
            state.lastPermissions = permissions
            return state.guard
        },
    },
})

mock.module("../../../src/lib/botClientRegistry.js", {
    namedExports: {
        tryGetBotClient: () => ({
            guilds: {
                cache: new Map([
                    [
                        GUILD,
                        {
                            members: { me: { voice: { channelId: "voice-1" } } },
                            voiceStates: { cache: new Map([[USER, { channelId: "voice-1" }]]) },
                        },
                    ],
                ]),
            },
            lavalink: { getPlayer: () => state.player },
        }),
        getBotClient: () => ({
            guilds: {
                cache: new Map([
                    [
                        GUILD,
                        {
                            members: { me: { voice: { channelId: "voice-1" } } },
                            voiceStates: { cache: new Map([[USER, { channelId: "voice-1" }]]) },
                        },
                    ],
                ]),
            },
            lavalink: {
                getPlayer: () => {
                    if (state.getPlayerThrows) throw new Error("lavalink down")
                    return state.player
                },
            },
        }),
    },
})

mock.module("../../../src/util/skipCurrentTrack.js", {
    namedExports: {
        skipCurrentTrack: async () => {
            if (state.skip === "throw") throw new Error("skip failed")
            return state.skip
        },
    },
})

mock.module("../../../src/shared/websocket/PlayerBroadcaster.js", {
    namedExports: {
        playerBroadcaster: {
            broadcastPlayerEvent(_guildId: string, _player: unknown, type: string) {
                state.broadcasts.push(type)
            },
        },
    },
})

const localStop = {
    cancelledPending: false,
    stoppedLocal: false,
    calls: 0,
}

mock.module("../../../src/util/stopLocalForUserStop.js", {
    namedExports: {
        stopLocalPlaybackForUserStop: () => {
            localStop.calls += 1
            return {
                cancelledPending: localStop.cancelledPending,
                stoppedLocal: localStop.stoppedLocal,
            }
        },
        userStopAffectedLocalPlayback: (result: {
            cancelledPending: boolean
            stoppedLocal: boolean
        }) => result.cancelledPending || result.stoppedLocal,
    },
})

const { playerGET, playerPOST } = await import("../../../src/botApi/handlers/player.js")
const { setPlayerSessionPersistenceDbForTests } =
    await import("../../../src/util/playerSessionPersistence.js")

describe("player handlers", () => {
    before(() => {
        setPlayerSessionPersistenceDbForTests({
            upsertPlayerSession: async () => undefined,
            deletePlayerSession: async () => undefined,
        })
    })

    it("returns the player GET permission failure", async () => {
        state.guard = { ok: false, status: 401, error: "Unauthorized", details: "Sign in." }
        const result = await playerGET(new Headers(), GUILD)
        assert.equal(result.status, 401)
        assert.equal(result.body.ok === false && result.body.error.error, "Unauthorized")
        assert.deepEqual(state.lastPermissions, [WebPermission.VIEW_PLAYER])
        state.guard = {
            ok: true,
            discordUserId: USER,
            session: {
                user: { id: "u", name: "Ada" },
                session: { id: "s", expiresAt: "2099-01-01" },
            },
            permissionResolution: {},
        }
    })

    it("returns the current player state", async () => {
        state.player = basePlayer()
        state.getPlayerThrows = false
        const result = await playerGET(new Headers(), GUILD)
        assert.equal(result.status, 200)
        if (result.body.ok) assert.equal(result.body.data.status, "playing")
    })

    it("returns 500 when loading player state throws", async () => {
        state.getPlayerThrows = true
        const result = await playerGET(new Headers(), GUILD)
        assert.equal(result.status, 500)
        assert.equal(result.body.ok === false && result.body.error.error, "internal_error")
        state.getPlayerThrows = false
    })

    it("returns the player POST permission failure", async () => {
        state.guard = {
            ok: false,
            status: 403,
            error: "Forbidden",
            details: "No playback control.",
        }
        state.player = basePlayer()
        state.broadcasts = []
        const result = await playerPOST(new Headers(), GUILD, { action: "pause" })
        assert.equal(result.status, 403)
        assert.equal(result.body.ok === false && result.body.error.error, "Forbidden")
        assert.deepEqual(state.lastPermissions, [WebPermission.CONTROL_PLAYBACK])
        assert.deepEqual(state.broadcasts, [])
        state.guard = {
            ok: true,
            discordUserId: USER,
            session: {
                user: { id: "u", name: "Ada" },
                session: { id: "s", expiresAt: "2099-01-01" },
            },
            permissionResolution: {},
        }
    })

    it("returns 404 when there is no player", async () => {
        state.player = null
        localStop.cancelledPending = false
        localStop.stoppedLocal = false
        localStop.calls = 0
        const result = await playerPOST(new Headers(), GUILD, { action: "pause" })
        assert.equal(result.status, 404)
        assert.equal(
            result.body.ok === false && result.body.error.error,
            "No active player for this guild."
        )
    })

    it("stops pending local playback when stop is posted with no Lavalink player", async () => {
        state.player = null
        localStop.cancelledPending = true
        localStop.stoppedLocal = false
        localStop.calls = 0
        const result = await playerPOST(new Headers(), GUILD, { action: "stop" })
        assert.equal(result.status, 200)
        assert.equal(localStop.calls, 1)
        if (result.body.ok) assert.equal(result.body.data.hasPlayer, false)
    })

    it("returns 404 for stop when neither Lavalink nor local playback is active", async () => {
        state.player = null
        localStop.cancelledPending = false
        localStop.stoppedLocal = false
        localStop.calls = 0
        const result = await playerPOST(new Headers(), GUILD, { action: "stop" })
        assert.equal(result.status, 404)
        assert.equal(localStop.calls, 1)
    })

    it("returns 400 for an invalid action", async () => {
        state.player = basePlayer()
        const result = await playerPOST(new Headers(), GUILD, { action: "explode" })
        assert.equal(result.status, 400)
        assert.equal(result.body.ok === false && result.body.error.error, "Invalid action.")
    })

    it("returns 400 when seek is not a positive number", async () => {
        state.player = basePlayer()
        const result = await playerPOST(new Headers(), GUILD, { action: "seek", value: -1 })
        assert.equal(result.status, 400)
        assert.equal(
            result.body.ok === false && result.body.error.error,
            "Seek value must be a positive number."
        )
    })

    it("returns 409 when skip raced a replaced player", async () => {
        state.player = basePlayer()
        state.skip = "stale"
        state.broadcasts = []
        const result = await playerPOST(new Headers(), GUILD, { action: "skip" })
        assert.equal(result.status, 409)
        assert.equal(result.body.ok === false && result.body.error.error, "player_replaced")
        assert.deepEqual(state.broadcasts, [])
    })

    it("returns 409 when the next track is not ready to skip", async () => {
        state.skip = "deferred"
        state.broadcasts = []
        const result = await playerPOST(new Headers(), GUILD, { action: "skip" })
        assert.equal(result.status, 409)
        assert.equal(result.body.ok === false && result.body.error.error, "next_track_not_ready")
        assert.deepEqual(state.broadcasts, [])
    })

    it("returns the player state after pause", async () => {
        state.player = basePlayer()
        state.broadcasts = []
        const result = await playerPOST(new Headers(), GUILD, { action: "pause" })
        assert.equal(result.status, 200)
        if (result.body.ok) assert.equal(result.body.data.hasPlayer, true)
        assert.deepEqual(state.broadcasts, ["queueUpdate"])
    })

    it("returns empty player state after stop and broadcasts playerDestroy", async () => {
        state.player = basePlayer({
            async destroy() {
                state.player = null
            },
        })
        state.broadcasts = []
        const result = await playerPOST(new Headers(), GUILD, { action: "stop" })
        assert.equal(result.status, 200)
        if (result.body.ok) assert.equal(result.body.data.hasPlayer, false)
        assert.deepEqual(state.broadcasts, ["playerDestroy"])
    })

    it("returns 500 when a player action throws", async () => {
        state.player = basePlayer()
        state.skip = "throw"
        const result = await playerPOST(new Headers(), GUILD, { action: "skip" })
        assert.equal(result.status, 500)
        assert.equal(
            result.body.ok === false && result.body.error.details,
            "An internal error occurred."
        )
    })
})
