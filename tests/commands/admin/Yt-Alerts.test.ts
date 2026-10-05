import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"
import { ChannelType } from "discord.js"
import ytAlerts from "../../../src/commands/admin/Yt-Alerts.js"
import {
    initializeYoutubeAlertStore,
    resetYoutubeAlertStoreForTests,
    setYoutubeAlertStoreDbForTests,
} from "../../../src/util/youtubeAlertStore.js"
import {
    createBotClientFake,
    createSlashInteraction,
    messageContents,
    type RecordedMessage,
} from "../../test-support/commandFakes.js"
import type {
    UploadEventType,
    YoutubeAlertEntry,
    YoutubeWatchEntry,
} from "../../../src/types/index.js"

const CHANNEL_ID = "UCXuqSBlHAE6Xw-yeJA0Tunw"
const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed><title>Cool Creator</title></feed>`

const previousCallback = process.env.YOUTUBE_PUBSUB_CALLBACK_URL
const previousFetch = globalThis.fetch

type FetchMode = "ok" | "throw" | "miss"

let fetchMode: FetchMode = "ok"
let createdWatch = true
let seenThrows = false
let watches: YoutubeWatchEntry[] = []
let alerts: YoutubeAlertEntry[] = []
let updateResult: YoutubeAlertEntry | null = null
let deleteResult: { alert: YoutubeAlertEntry; removedWatch: YoutubeWatchEntry | null } | null = null

afterEach(() => {
    if (previousCallback === undefined) delete process.env.YOUTUBE_PUBSUB_CALLBACK_URL
    else process.env.YOUTUBE_PUBSUB_CALLBACK_URL = previousCallback
    globalThis.fetch = previousFetch
    resetYoutubeAlertStoreForTests()
    setYoutubeAlertStoreDbForTests(null)
    fetchMode = "ok"
    createdWatch = true
    seenThrows = false
    watches = []
    alerts = []
    updateResult = null
    deleteResult = null
})

function watch(partial?: Partial<YoutubeWatchEntry>): YoutubeWatchEntry {
    return {
        id: 1,
        guildId: "guild-1",
        youtubeChannelId: CHANNEL_ID,
        youtubeChannelName: "Cool Creator",
        createdAt: new Date(),
        ...partial,
    }
}

function alert(partial?: Partial<YoutubeAlertEntry>): YoutubeAlertEntry {
    return {
        id: 4,
        watchId: 1,
        discordChannelId: "ch-9",
        mentionRoleIds: [],
        messageTemplate: null,
        eventTypes: ["video"],
        createdBy: "user-1",
        createdAt: new Date(),
        ...partial,
    }
}

async function boot() {
    delete process.env.YOUTUBE_PUBSUB_CALLBACK_URL
    globalThis.fetch = (async () => {
        if (fetchMode === "throw") throw new Error("network")
        const ok = fetchMode === "ok"
        return new Response(ok ? FEED : "missing", { status: ok ? 200 : 404 })
    }) as typeof fetch
    resetYoutubeAlertStoreForTests()
    setYoutubeAlertStoreDbForTests({
        getAllYoutubeWatchesFromDatabase: async () => ({
            watches,
            alerts,
            seenByWatch: {},
            leases: [],
        }),
        createYoutubeAlertWithWatch: async (input) => ({
            createdWatch,
            watch: watch({
                guildId: input.guildId,
                youtubeChannelId: input.youtubeChannelId,
                youtubeChannelName: input.youtubeChannelName,
            }),
            alert: alert({
                id: 3,
                discordChannelId: input.discordChannelId,
                mentionRoleIds: input.mentionRoleIds,
                messageTemplate: input.messageTemplate,
                eventTypes: input.eventTypes,
                createdBy: input.createdBy,
            }),
        }),
        addYoutubeSeenVideos: async () => {
            if (seenThrows) throw new Error("rss down")
        },
        updateYoutubeAlert: async () => updateResult,
        deleteYoutubeAlert: async () => deleteResult,
        upsertYoutubeChannelLease: async () => undefined,
        deleteYoutubeChannelLease: async () => undefined,
    })
    await initializeYoutubeAlertStore()
}

function texts(calls: RecordedMessage[]): string[] {
    return messageContents(calls).filter((value): value is string => typeof value === "string")
}

function embedData(calls: RecordedMessage[]): { title?: string; description?: string } | undefined {
    for (const call of calls) {
        const embed = call.embeds?.[0] as
            | { data?: { title?: string; description?: string } }
            | undefined
        if (embed?.data) return embed.data
    }
    return undefined
}

function postChannel(canPost = true) {
    return {
        id: "ch-9",
        type: ChannelType.GuildText,
        toString: () => "<#ch-9>",
        permissionsFor: () => ({ has: () => canPost }),
    }
}

function guild(withMe = false) {
    return {
        id: "guild-1",
        members: withMe ? { me: { id: "bot-1" } } : {},
    }
}

function slash(input: Parameters<typeof createSlashInteraction>[0] = {}) {
    return createSlashInteraction({
        ...input,
        guild: input.guild === undefined ? guild(false) : input.guild,
    })
}

describe("yt-alerts", () => {
    it("requires a server", async () => {
        const { interaction, calls } = slash({ guild: null, subcommand: "list" })
        await ytAlerts.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), ["Use this command in a server."])
    })

    it("rejects an unknown subcommand", async () => {
        await boot()
        const { interaction, calls } = slash({ subcommand: "nope" })
        await ytAlerts.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), ["Unknown subcommand."])
    })

    it("repeats an invalid YouTube channel reason", async () => {
        await boot()
        const { interaction, calls } = slash({
            subcommand: "add",
            options: { youtube: "https://example.com/not-youtube", channel: postChannel() },
        })
        await ytAlerts.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), ["That is not a YouTube URL."])
    })

    it("asks for a server text or announcement channel", async () => {
        await boot()
        const { interaction, calls } = slash({
            subcommand: "add",
            options: {
                youtube: CHANNEL_ID,
                channel: { id: "voice", type: ChannelType.GuildVoice, toString: () => "<#voice>" },
            },
        })
        await ytAlerts.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), ["Pick a server text or announcement channel."])
    })

    it("requires at least one event type when adding", async () => {
        await boot()
        const { interaction, calls } = slash({
            subcommand: "add",
            options: { youtube: CHANNEL_ID, channel: postChannel(), video: false },
        })
        await ytAlerts.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), [
            "Turn on at least one event type, or omit all type options to match everything.",
        ])
    })

    it("says the bot cannot post in the chosen channel", async () => {
        await boot()
        const { interaction, calls } = slash({
            subcommand: "add",
            guild: guild(true) as { id: string },
            options: { youtube: CHANNEL_ID, channel: postChannel(false) },
        })
        await ytAlerts.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), [
            "I need View Channel, Send Messages, and Embed Links in <#ch-9>.",
        ])
    })

    it("says YouTube could not be reached", async () => {
        fetchMode = "throw"
        await boot()
        const { interaction, calls } = slash({
            subcommand: "add",
            options: { youtube: CHANNEL_ID, channel: postChannel() },
        })
        await ytAlerts.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), [
            "Could not reach YouTube to resolve that channel. Try again in a moment.",
        ])
    })

    it("says the YouTube channel could not be resolved", async () => {
        fetchMode = "miss"
        await boot()
        const { interaction, calls } = slash({
            subcommand: "add",
            options: { youtube: CHANNEL_ID, channel: postChannel() },
        })
        await ytAlerts.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), [
            "Could not resolve that YouTube channel. Use a channel URL, @handle, or UC… id.",
        ])
    })

    it("rolls back when the current videos cannot be snapshotted", async () => {
        seenThrows = true
        await boot()
        const { interaction, calls } = slash({
            subcommand: "add",
            options: { youtube: CHANNEL_ID, channel: postChannel() },
        })
        await ytAlerts.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), [
            "Created the Alert but could not snapshot the channel’s current videos. Try again.",
        ])
    })

    it("confirms a new Upload Alert and Upload Watch", async () => {
        await boot()
        const { interaction, calls } = slash({
            subcommand: "add",
            options: { youtube: CHANNEL_ID, channel: postChannel() },
        })
        await ytAlerts.execute(interaction, createBotClientFake())
        const content = texts(calls)[0] ?? ""
        assert.match(content, /Added Upload Alert \*\*#3\*\* for \*\*Cool Creator\*\* in <#ch-9>/)
        assert.match(content, /Started an Upload Watch for this creator/)
    })

    it("confirms an Upload Alert attached to an existing Watch", async () => {
        createdWatch = false
        await boot()
        const { interaction, calls } = slash({
            subcommand: "add",
            options: { youtube: CHANNEL_ID, channel: postChannel(), video: true },
        })
        await ytAlerts.execute(interaction, createBotClientFake())
        assert.match(
            texts(calls)[0] ?? "",
            /Attached to the existing Upload Watch for this creator/
        )
    })

    it("says there are no Upload Alerts", async () => {
        await boot()
        const { interaction, calls } = slash({ subcommand: "list" })
        await ytAlerts.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), [
            "No Upload Alerts in this server. Use `/yt-alerts add` to create one.",
        ])
    })

    it("lists Upload Alerts", async () => {
        watches = [watch()]
        alerts = [alert()]
        await boot()
        const { interaction, calls } = slash({ subcommand: "list" })
        await ytAlerts.execute(interaction, createBotClientFake())
        assert.equal(embedData(calls)?.title, "Upload Alerts")
        assert.match(embedData(calls)?.description ?? "", /Alert \*\*#4\*\*/)
    })

    it("truncates a very long Upload Alert list", async () => {
        watches = [watch({ youtubeChannelName: "A".repeat(4000) })]
        alerts = [alert()]
        await boot()
        const { interaction, calls } = slash({ subcommand: "list" })
        await ytAlerts.execute(interaction, createBotClientFake())
        assert.match(embedData(calls)?.description ?? "", /\n…$/)
    })

    it("says the Upload Alert id was not found", async () => {
        await boot()
        const { interaction, calls } = slash({
            subcommand: "remove",
            options: { alert_id: 9 },
        })
        await ytAlerts.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), ["No Upload Alert **#9** in this server."])
    })

    it("removes an Upload Alert and its Watch", async () => {
        watches = [watch()]
        alerts = [alert()]
        deleteResult = { alert: alert(), removedWatch: watch() }
        await boot()
        const { interaction, calls } = slash({
            subcommand: "remove",
            options: { alert_id: 4 },
        })
        await ytAlerts.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), [
            "Removed Alert **#4** and the Upload Watch for **Cool Creator**.",
        ])
    })

    it("removes an Upload Alert and keeps the Watch", async () => {
        watches = [watch()]
        alerts = [alert()]
        deleteResult = { alert: alert(), removedWatch: null }
        await boot()
        const { interaction, calls } = slash({
            subcommand: "remove",
            options: { alert_id: 4 },
        })
        await ytAlerts.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), ["Removed Alert **#4**."])
    })

    it("rejects a non-text channel while editing", async () => {
        watches = [watch()]
        alerts = [alert()]
        await boot()
        const { interaction, calls } = slash({
            subcommand: "edit",
            options: {
                alert_id: 4,
                channel: { id: "voice", type: ChannelType.GuildVoice, toString: () => "<#voice>" },
            },
        })
        await ytAlerts.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), ["Pick a server text or announcement channel."])
    })

    it("requires at least one event type when editing", async () => {
        watches = [watch()]
        alerts = [alert()]
        await boot()
        const { interaction, calls } = slash({
            subcommand: "edit",
            options: { alert_id: 4, video: false },
        })
        await ytAlerts.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), [
            "Turn on at least one event type, or omit all type options to leave them unchanged.",
        ])
    })

    it("confirms an Upload Alert was updated", async () => {
        watches = [watch()]
        alerts = [alert()]
        updateResult = alert({ eventTypes: ["video", "live"] satisfies UploadEventType[] })
        await boot()
        const { interaction, calls } = slash({
            subcommand: "edit",
            options: { alert_id: 4, video: true, live: true },
        })
        await ytAlerts.execute(interaction, createBotClientFake())
        assert.match(
            texts(calls)[0] ?? "",
            /Updated Alert \*\*#4\*\* for \*\*Cool Creator\*\*\.\nChannel: <#ch-9>/
        )
    })
})
