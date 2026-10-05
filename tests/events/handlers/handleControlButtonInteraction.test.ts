import assert from "node:assert/strict"
import { beforeEach, describe, it, mock } from "node:test"
import { messageContents, type RecordedMessage } from "../../test-support/commandFakes.js"
import {
    initializeGuildSettingsStore,
    resetGuildSettingsStoreForTests,
    setGuildSettingsStoreDbForTests,
} from "../../../src/util/saveControlChannel.js"
import { setPlayerSessionPersistenceDbForTests } from "../../../src/util/playerSessionPersistence.js"
import { SKIP_DEFERRED_USER_MESSAGE } from "../../../src/util/skipDeferredResult.js"

const deps = {
    skip: async (): Promise<"skipped" | "stale" | "deferred"> => "skipped",
    shuffle: async (): Promise<boolean | "stale"> => true,
    start: async () => undefined as unknown,
}

mock.module("../../../src/util/skipCurrentTrack.js", {
    namedExports: {
        skipCurrentTrack: () => deps.skip(),
    },
})

mock.module("../../../src/util/livePlayerQueueMutations.js", {
    namedExports: {
        shuffleUpcomingOnLivePlayer: () => deps.shuffle(),
    },
})

mock.module("../../../src/util/startPlaybackIfNeeded.js", {
    namedExports: {
        startPlaybackIfNeeded: () => deps.start(),
    },
})

const { handleControlButtonInteraction } =
    await import("../../../src/events/handlers/handleControlButtonInteraction.js")

type ButtonFake = {
    customId: string
    guildId: string | null
    channelId: string
    message: { id: string }
    guild: {
        id: string
        members: { me?: { voice?: { channelId?: string | null } } }
        fetch?: unknown
    } | null
    member: { voice?: { channel?: { id: string } | null } }
    user: { id: string }
    replied: boolean
    deferred: boolean
    deferUpdate: () => Promise<void>
    reply: (payload?: Record<string, unknown>) => Promise<void>
    followUp: (payload?: Record<string, unknown>) => Promise<void>
}

function createButton(customId: string, calls: RecordedMessage[]): ButtonFake {
    return {
        customId,
        guildId: "guild-1",
        channelId: "channel-1",
        message: { id: "message-1" },
        guild: { id: "guild-1", members: { me: { voice: { channelId: "voice-1" } } } },
        member: { voice: { channel: { id: "voice-1" } } },
        user: { id: "user-1" },
        replied: false,
        deferred: false,
        async deferUpdate() {
            this.deferred = true
            calls.push({ method: "deferUpdate" })
        },
        async reply(payload = {}) {
            this.replied = true
            calls.push({
                method: "reply",
                content: typeof payload.content === "string" ? payload.content : undefined,
            })
        },
        async followUp(payload = {}) {
            calls.push({
                method: "followUp",
                content: typeof payload.content === "string" ? payload.content : undefined,
            })
        },
    }
}

function createPlayer(overrides: Record<string, unknown> = {}) {
    const bag = new Map<string, unknown>()
    const tracks: unknown[] = []
    return {
        guildId: "guild-1",
        connected: true,
        playing: false,
        paused: false,
        voiceChannelId: "voice-1",
        repeatMode: "off",
        queue: { current: { info: { title: "Song" } }, tracks, previous: [] },
        get: (key: string) => bag.get(key),
        set: (key: string, value: unknown) => bag.set(key, value),
        async pause() {},
        async resume() {},
        async connect() {},
        async destroy() {},
        async setRepeatMode(mode: string) {
            this.repeatMode = mode
        },
        ...overrides,
    }
}

function createClient(player: unknown) {
    const logs: Array<{ level: string; args: unknown[] }> = []
    const log =
        (level: string) =>
        (...args: unknown[]) => {
            logs.push({ level, args })
        }
    return {
        debug: log("debug"),
        info: log("info"),
        warn: log("warn"),
        error: log("error"),
        user: { id: "bot-1" },
        channels: { fetch: async () => null, cache: new Map() },
        lavalink: { getPlayer: () => player },
        logs,
    }
}

async function initControlSettings() {
    resetGuildSettingsStoreForTests()
    setGuildSettingsStoreDbForTests({
        getGuildSettingsStoreFromDatabase: async () => ({
            "guild-1": { controlChannelId: "channel-1", controlMessageId: "message-1" },
        }),
        replaceGuildSettingsStoreInDatabase: async () => undefined,
    })
    await initializeGuildSettingsStore({ debug() {} })
}

async function run(
    customId: string,
    player: unknown,
    tune?: (button: ButtonFake, client: ReturnType<typeof createClient>) => void
) {
    const calls: RecordedMessage[] = []
    const button = createButton(customId, calls)
    const client = createClient(player)
    tune?.(button, client)
    await handleControlButtonInteraction(button as never, client as never)
    return { calls, client, button }
}

describe("handleControlButtonInteraction", () => {
    beforeEach(async () => {
        deps.skip = async () => "skipped"
        deps.shuffle = async () => true
        deps.start = async () => undefined
        setPlayerSessionPersistenceDbForTests({
            upsertPlayerSession: async () => undefined,
            deletePlayerSession: async () => undefined,
        })
        await initControlSettings()
    })

    it("replies that the bot is still starting", async () => {
        resetGuildSettingsStoreForTests()
        const { calls } = await run("control_stop", createPlayer())
        assert.deepEqual(messageContents(calls), [
            "Bot is still starting up. Please try again in a moment.",
        ])
    })

    it("replies to use the designated channel", async () => {
        const { calls } = await run("control_stop", createPlayer(), (button) => {
            button.channelId = "elsewhere"
        })
        assert.deepEqual(messageContents(calls), [
            "Please use player controls in the designated channel.",
        ])
    })

    it("replies when the control message is outdated", async () => {
        const { calls } = await run("control_stop", createPlayer(), (button) => {
            button.message = { id: "old-message" }
        })
        assert.deepEqual(messageContents(calls), [
            "This control message seems outdated. Try running /control-channel set again.",
        ])
    })

    it("replies when the player is missing", async () => {
        const { calls } = await run("control_stop", undefined)
        assert.deepEqual(messageContents(calls), [
            "Player not found. It might have been stopped or disconnected.",
        ])
    })

    it("tells autoplay users to join a voice channel", async () => {
        const { calls } = await run("control_autoplay", createPlayer(), (button) => {
            button.member = { voice: { channel: null } }
        })
        assert.deepEqual(messageContents(calls), ["Join a voice channel first!"])
    })

    it("tells other controls to join a voice channel", async () => {
        const { calls } = await run("control_stop", createPlayer(), (button) => {
            button.member = { voice: { channel: null } }
        })
        assert.deepEqual(messageContents(calls), [
            "You must be in a voice channel to use the controls!",
        ])
    })

    it("tells autoplay users to match the bot voice channel", async () => {
        const { calls } = await run("control_autoplay", createPlayer(), (button) => {
            button.member = { voice: { channel: { id: "voice-2" } } }
        })
        assert.deepEqual(messageContents(calls), [
            "You need to be in the same voice channel as the bot!",
        ])
    })

    it("tells other controls to match the bot voice channel", async () => {
        const { calls } = await run("control_stop", createPlayer(), (button) => {
            button.member = { voice: { channel: { id: "voice-2" } } }
        })
        assert.deepEqual(messageContents(calls), [
            "You must be in the same voice channel as the bot to use the controls!",
        ])
    })

    it("replies when the player was replaced", async () => {
        const player = createPlayer({ playing: true })
        const other = createPlayer()
        let reads = 0
        const { calls } = await run("control_play_pause", player, (_button, client) => {
            client.lavalink.getPlayer = () => {
                reads += 1
                return reads === 1 ? player : other
            }
        })
        assert.deepEqual(messageContents(calls), [
            "The player was replaced. Try the control again on the current session.",
        ])
    })

    it("replies when idle play cannot reconnect", async () => {
        const player = createPlayer({
            connected: false,
            voiceChannelId: null,
            playing: false,
            paused: false,
        })
        const { calls } = await run("control_play_pause", player)
        assert.deepEqual(messageContents(calls), [
            "I seem to be disconnected or you're not in my channel. Please try adding a song again or use /join.",
        ])
    })

    it("replies when the player is replaced during reconnect", async () => {
        const player = createPlayer({ connected: false, playing: false, paused: false })
        const other = createPlayer()
        let reads = 0
        const { calls } = await run("control_play_pause", player, (_button, client) => {
            client.lavalink.getPlayer = () => {
                reads += 1
                return reads < 3 ? player : other
            }
        })
        assert.deepEqual(messageContents(calls), [
            "The player was replaced during reconnect. Try the control again.",
        ])
    })

    it("replies when controlling the player fails", async () => {
        deps.start = async () => {
            throw new Error("play failed")
        }
        const player = createPlayer({ playing: false, paused: false })
        const { calls } = await run("control_play_pause", player)
        assert.deepEqual(messageContents(calls), [
            "An error occurred while controlling the player.",
        ])
    })

    it("replies BYE after stop", async () => {
        const { calls } = await run("control_stop", createPlayer())
        assert.deepEqual(messageContents(calls), ["BYE!"])
    })

    it("replies when nothing can be skipped", async () => {
        const player = createPlayer()
        player.queue.current = null
        player.queue.tracks = []
        const { calls } = await run("control_skip", player)
        assert.deepEqual(messageContents(calls), ["Nothing is currently playing to skip."])
    })

    it("replies when skip is deferred", async () => {
        deps.skip = async () => "deferred"
        const { calls } = await run("control_skip", createPlayer())
        assert.deepEqual(messageContents(calls), [SKIP_DEFERRED_USER_MESSAGE])
    })

    it("replies when skip reports a replaced player", async () => {
        deps.skip = async () => "stale"
        const { calls } = await run("control_skip", createPlayer())
        assert.deepEqual(messageContents(calls), [
            "The player was replaced. Try the control again on the current session.",
        ])
    })

    it("replies that the track was skipped", async () => {
        const { calls } = await run("control_skip", createPlayer())
        assert.deepEqual(messageContents(calls), ["Skipped."])
    })

    it("replies when there are not enough songs to shuffle", async () => {
        const { calls } = await run("control_shuffle", createPlayer())
        assert.deepEqual(messageContents(calls), ["Not enough songs in the queue to shuffle."])
    })

    it("replies when shuffle sees a replaced player", async () => {
        deps.shuffle = async () => "stale"
        const player = createPlayer()
        player.queue.tracks = [{}, {}]
        const { calls } = await run("control_shuffle", player)
        assert.deepEqual(messageContents(calls), [
            "The player was replaced. Try the control again on the current session.",
        ])
    })

    it("replies when the queue changes before shuffle", async () => {
        deps.shuffle = async () => false
        const player = createPlayer()
        player.queue.tracks = [{}, {}]
        const { calls } = await run("control_shuffle", player)
        assert.deepEqual(messageContents(calls), ["The queue changed before it could be shuffled."])
    })

    it("replies that the queue was shuffled", async () => {
        const player = createPlayer()
        player.queue.tracks = [{}, {}]
        const { calls } = await run("control_shuffle", player)
        assert.deepEqual(messageContents(calls), ["Queue shuffled."])
    })

    it("replies when shuffle throws", async () => {
        deps.shuffle = async () => {
            throw new Error("shuffle failed")
        }
        const player = createPlayer()
        player.queue.tracks = [{}, {}]
        const { calls } = await run("control_shuffle", player)
        assert.deepEqual(messageContents(calls), ["An error occurred while trying to shuffle."])
    })

    it("replies that track loop is enabled", async () => {
        const player = createPlayer()
        player.repeatMode = "off"
        const { calls } = await run("control_loop", player)
        assert.deepEqual(messageContents(calls), ["Track loop enabled."])
    })

    it("replies that queue loop is enabled", async () => {
        const player = createPlayer()
        player.repeatMode = "track"
        const { calls } = await run("control_loop", player)
        assert.deepEqual(messageContents(calls), ["Queue loop enabled."])
    })

    it("replies that loop is disabled", async () => {
        const player = createPlayer()
        player.repeatMode = "queue"
        const { calls } = await run("control_loop", player)
        assert.deepEqual(messageContents(calls), ["Loop disabled."])
    })

    it("replies when setting loop mode fails", async () => {
        const player = createPlayer()
        player.setRepeatMode = async () => {
            throw new Error("loop failed")
        }
        const { calls } = await run("control_loop", player)
        assert.deepEqual(messageContents(calls), ["An error occurred while setting loop mode."])
    })

    it("replies that autoplay is enabled", async () => {
        const { calls } = await run("control_autoplay", createPlayer())
        assert.deepEqual(messageContents(calls), ["Autoplay **enabled**."])
    })

    it("replies that autoplay is disabled", async () => {
        const player = createPlayer()
        player.set("autoplay", true)
        const { calls } = await run("control_autoplay", player)
        assert.deepEqual(messageContents(calls), ["Autoplay **disabled**."])
    })
})
