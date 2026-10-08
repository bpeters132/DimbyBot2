import assert from "node:assert/strict"
import { beforeEach, describe, it, mock } from "node:test"
import {
    initializeGuildSettingsStore,
    resetGuildSettingsStoreForTests,
    setGuildSettingsStoreDbForTests,
} from "../../src/util/saveControlChannel.js"
import { setPlayerSessionPersistenceDbForTests } from "../../src/util/playerSessionPersistence.js"
import lavaManagerEvents from "../../src/events/lavaManagerEvents.js"

type Listener = (...args: unknown[]) => unknown

async function initEmptySettings() {
    resetGuildSettingsStoreForTests()
    setGuildSettingsStoreDbForTests({
        getGuildSettingsStoreFromDatabase: async () => ({}),
        replaceGuildSettingsStoreInDatabase: async () => undefined,
    })
    await initializeGuildSettingsStore({ debug() {} })
}

function track(title: string, sourceName = "http") {
    return {
        encoded: "enc",
        info: {
            title,
            author: "Artist",
            uri: `https://example.com/${title}`,
            duration: 1000,
            isStream: false,
            sourceName,
            identifier: title,
        },
        requester: "user-1",
    }
}

function createPlayer(guildId: string) {
    const bag = new Map<string, unknown>()
    const tracks: unknown[] = []
    const player = {
        guildId,
        textChannelId: "text-1",
        voiceChannelId: "voice-1",
        playing: false,
        paused: false,
        connected: true,
        position: 0,
        repeatMode: "off",
        queue: {
            current: null as unknown,
            tracks,
            previous: [] as unknown[],
            async splice(start: number, deleteCount: number, ...insert: unknown[]) {
                const flat = insert.flat()
                return tracks.splice(start, deleteCount, ...flat)
            },
        },
        get: (key: string) => bag.get(key),
        set: (key: string, value: unknown) => {
            bag.set(key, value)
        },
        async destroy() {},
        async skip() {},
        async stopPlaying() {},
        async play() {},
    }
    return player
}

function createHarness() {
    const handlers = new Map<string, Listener[]>()
    const sent: string[] = []
    const logs: Array<{ level: string; args: unknown[] }> = []
    const log =
        (level: string) =>
        (...args: unknown[]) => {
            logs.push({ level, args })
        }
    const players = new Map<string, ReturnType<typeof createPlayer>>()
    const lavalink = {
        players,
        getPlayer: (guildId: string) => players.get(guildId),
        on(event: string, cb: Listener) {
            const list = handlers.get(event) ?? []
            list.push(cb)
            handlers.set(event, list)
            return lavalink
        },
    }
    const channel = {
        id: "text-1",
        isTextBased: () => true,
        send: async (content: string | { content: string }) => {
            const text = typeof content === "string" ? content : content.content
            sent.push(text)
            return {
                async delete() {},
            }
        },
    }
    const client = {
        error: log("error"),
        warn: log("warn"),
        info: log("info"),
        debug: log("debug"),
        channels: {
            cache: new Map<string, unknown>([["text-1", channel]]),
            fetch: async () => channel,
        },
        guilds: { cache: new Map(), fetch: async () => null },
        users: { fetch: async () => null },
        lavalink,
        logs,
    }
    return { client, handlers, sent, logs, players, channel }
}

async function flush() {
    for (let i = 0; i < 8; i++) {
        await new Promise((resolve) => setImmediate(resolve))
    }
}

function errorText(logs: Array<{ level: string; args: unknown[] }>) {
    return logs
        .filter((entry) => entry.level === "error")
        .map((entry) => entry.args.map(String).join(" "))
        .join("\n")
}

describe("lavaManagerEvents", () => {
    beforeEach(async () => {
        setPlayerSessionPersistenceDbForTests({
            upsertPlayerSession: async () => undefined,
            deletePlayerSession: async () => undefined,
        })
        await initEmptySettings()
    })

    it("sends the now-playing message", async () => {
        const { client, handlers, sent, players } = createHarness()
        const player = createPlayer("guild-now")
        players.set(player.guildId, player)
        await lavaManagerEvents(client as never)
        await handlers.get("trackStart")?.[0]?.(player, track("Song"))
        await flush()
        assert.equal(sent[0], "Now playing: **Song**")
    })

    it("logs when the now-playing message cannot be sent", async () => {
        const { client, handlers, logs, players, channel } = createHarness()
        channel.send = async () => {
            throw new Error("send failed")
        }
        const player = createPlayer("guild-send")
        players.set(player.guildId, player)
        await lavaManagerEvents(client as never)
        await handlers.get("trackStart")?.[0]?.(player, track("Song"))
        await flush()
        assert.match(errorText(logs), /Failed to send trackStart message/)
    })

    it("sends the stuck-track message", async () => {
        const { client, handlers, sent, players } = createHarness()
        const player = createPlayer("guild-stuck")
        players.set(player.guildId, player)
        await lavaManagerEvents(client as never)
        await handlers.get("trackStuck")?.[0]?.(player, track("Stuck"), { thresholdMs: 1000 })
        await flush()
        assert.equal(sent[0], "Track stuck: **Stuck**")
    })

    it("sends a detailed message when audio streams are unsupported", async () => {
        const { client, handlers, sent, players } = createHarness()
        const player = createPlayer("guild-age")
        players.set(player.guildId, player)
        await lavaManagerEvents(client as never)
        await handlers.get("trackError")?.[0]?.(player, track("Blocked", "youtube"), {
            exception: { cause: "No supported audio streams available", message: "nope" },
        })
        await flush()
        assert.match(sent[0] ?? "", /age-restricted/)
        assert.match(sent[0] ?? "", /\/download/)
    })

    it("sends a generic track error message", async () => {
        const { client, handlers, sent, players } = createHarness()
        const player = createPlayer("guild-generic")
        players.set(player.guildId, player)
        await lavaManagerEvents(client as never)
        await handlers.get("trackError")?.[0]?.(player, track("Broken", "http"), {
            exception: { message: "decoder died", cause: "codec" },
        })
        await flush()
        assert.match(sent[0] ?? "", /decoder died/)
        assert.match(sent[0] ?? "", /codec/)
    })

    it("logs when skipping after a track error fails", async () => {
        const { client, handlers, logs, players } = createHarness()
        const player = createPlayer("guild-skip-err")
        player.queue.tracks.push(track("Next"))
        player.skip = async () => {
            throw new Error("skip failed")
        }
        players.set(player.guildId, player)
        await lavaManagerEvents(client as never)
        await handlers.get("trackError")?.[0]?.(player, track("Broken"), {
            exception: { message: "nope" },
        })
        await flush()
        assert.match(errorText(logs), /Failed to skip after track error/)
    })

    it("logs when ending a track for autoplay fails", async () => {
        const { client, handlers, logs, players } = createHarness()
        const player = createPlayer("guild-auto")
        player.set("autoplay", true)
        player.stopPlaying = async () => {
            throw new Error("stop failed")
        }
        players.set(player.guildId, player)
        await lavaManagerEvents(client as never)
        await handlers.get("trackError")?.[0]?.(player, track("Broken"), {
            exception: { message: "nope" },
        })
        await flush()
        assert.match(errorText(logs), /Failed to end track for autoplay/)
    })

    it("logs when idle destroy after a track error fails", async () => {
        const { client, handlers, logs, players } = createHarness()
        const player = createPlayer("guild-idle")
        player.destroy = async () => {
            throw new Error("destroy failed")
        }
        players.set(player.guildId, player)
        await lavaManagerEvents(client as never)
        await handlers.get("trackError")?.[0]?.(player, track("Broken"), {
            exception: { message: "nope" },
        })
        await flush()
        assert.match(errorText(logs), /Idle destroy after track error failed/)
    })

    it("sends the queue-ended message", async () => {
        const { client, handlers, sent, players } = createHarness()
        const player = createPlayer("guild-end")
        players.set(player.guildId, player)
        await lavaManagerEvents(client as never)
        await handlers.get("queueEnd")?.[0]?.(player)
        await flush()
        assert.equal(sent[0], "Queue has ended.")
    })

    it("logs when idle destroy after queue end fails", async () => {
        mock.timers.enable({ apis: ["setTimeout"] })
        try {
            const { client, handlers, logs, players } = createHarness()
            const player = createPlayer("guild-end-destroy")
            player.destroy = async () => {
                throw new Error("destroy failed")
            }
            players.set(player.guildId, player)
            await lavaManagerEvents(client as never)
            await handlers.get("queueEnd")?.[0]?.(player)
            mock.timers.tick(5000)
            await flush()
            assert.match(errorText(logs), /Idle destroy after queue end failed/)
        } finally {
            mock.timers.reset()
        }
    })

    it("arms autoReconnect play prepare from the playerReconnect listener", async () => {
        const { client, handlers, players } = createHarness()
        const player = createPlayer("guild-reconnect")
        player.queue.current = {
            encoded: "",
            info: {
                title: "Queued",
                author: "Artist",
                uri: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                duration: 1000,
                isStream: false,
                sourceName: "youtube",
                identifier: "dQw4w9WgXcQ",
            },
            requester: "user-1",
            userData: { queueMetadata: true },
        }
        players.set(player.guildId, player)
        await lavaManagerEvents(client as never)
        const before = player.play
        await handlers.get("playerReconnect")?.[0]?.(player)
        assert.notEqual(player.play, before)
    })

    it("does not wrap play on playerReconnect when current is already ready", async () => {
        const { client, handlers, players } = createHarness()
        const player = createPlayer("guild-reconnect-ready")
        player.queue.current = track("Ready")
        players.set(player.guildId, player)
        await lavaManagerEvents(client as never)
        const before = player.play
        await handlers.get("playerReconnect")?.[0]?.(player)
        assert.equal(player.play, before)
    })

    it("logs when clearing the player session fails", async () => {
        setPlayerSessionPersistenceDbForTests({
            upsertPlayerSession: async () => undefined,
            deletePlayerSession: async () => {
                throw new Error("db down")
            },
        })
        const { client, handlers, logs } = createHarness()
        const player = createPlayer("guild-clear")
        await lavaManagerEvents(client as never)
        await handlers.get("playerDestroy")?.[0]?.(player, "stop")
        await flush()
        assert.match(errorText(logs), /clearPlayerSession failed \(guildId=guild-clear\): db down/)
    })

    it("warns when guild settings cannot be read for a track message", async () => {
        resetGuildSettingsStoreForTests()
        const { client, handlers, logs, players } = createHarness()
        const player = createPlayer("guild-settings")
        players.set(player.guildId, player)
        await lavaManagerEvents(client as never)
        await handlers.get("trackStart")?.[0]?.(player, track("Song"))
        await flush()
        const warned = logs.find((entry) => entry.level === "warn")
        assert.match(String(warned?.args[0]), /Failed to read guild settings/)
    })

    it("logs when the alone-in-voice check throws", async () => {
        mock.timers.enable({ apis: ["setTimeout"] })
        try {
            const { client, handlers, logs, players } = createHarness()
            const player = createPlayer("guild-alone")
            players.set(player.guildId, player)
            client.channels.cache.set("voice-1", { id: "voice-1" })
            client.channels.fetch = (async () => ({
                isVoiceBased() {
                    throw new Error("voice fetch failed")
                },
            })) as unknown as typeof client.channels.fetch
            await lavaManagerEvents(client as never)
            await handlers.get("playerVoiceLeave")?.[0]?.(player, "user-9")
            mock.timers.tick(60_000)
            await flush()
            assert.match(errorText(logs), /Error checking channel members/)
        } finally {
            mock.timers.reset()
        }
    })

    it("sends the round-robin disconnect cleanup message", async () => {
        mock.timers.enable({ apis: ["setTimeout"] })
        try {
            const { client, handlers, sent, players } = createHarness()
            const player = createPlayer("guild-rrq")
            player.set("rrqEnabled", true)
            player.queue.tracks.push({ ...track("Queued"), requester: "user-9" })
            players.set(player.guildId, player)
            client.guilds.cache.set("guild-rrq", {
                members: { fetch: async () => ({ displayName: "Ada" }) },
            })
            await lavaManagerEvents(client as never)
            await handlers.get("playerVoiceLeave")?.[0]?.(player, "user-9")
            mock.timers.tick(60_000)
            await flush()
            assert.equal(sent.at(-1), "Removed **1** track(s) queued by Ada (left voice channel).")
        } finally {
            mock.timers.reset()
        }
    })

    it("logs when round-robin track removal fails", async () => {
        mock.timers.enable({ apis: ["setTimeout"] })
        try {
            const { client, handlers, logs, players } = createHarness()
            const player = createPlayer("guild-rrq-err")
            player.set("rrqEnabled", true)
            player.queue.tracks.push({ ...track("Queued"), requester: "user-9" })
            player.queue.splice = async () => {
                throw new Error("splice failed")
            }
            players.set(player.guildId, player)
            await lavaManagerEvents(client as never)
            await handlers.get("playerVoiceLeave")?.[0]?.(player, "user-9")
            mock.timers.tick(60_000)
            await flush()
            assert.match(errorText(logs), /RRQ removeUserTracksFromQueue failed/)
        } finally {
            mock.timers.reset()
        }
    })
})
