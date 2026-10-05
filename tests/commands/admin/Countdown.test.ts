import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"
import countdown from "../../../src/commands/admin/Countdown.js"
import {
    initializeCountdownStore,
    resetCountdownStoreForTests,
    setCountdownStoreDbForTests,
} from "../../../src/util/countdownStore.js"
import {
    createBotClientFake,
    createSlashInteraction,
    messageContents,
    type RecordedMessage,
} from "../../test-support/commandFakes.js"
import type { CountdownEntry, CountdownStore } from "../../../src/types/index.js"
import type BotClient from "../../../src/lib/BotClient.js"

let cache: CountdownStore = {}
let failCreate = false

afterEach(() => {
    resetCountdownStoreForTests()
    setCountdownStoreDbForTests(null)
    cache = {}
    failCreate = false
})

function entry(partial: Partial<CountdownEntry> & Pick<CountdownEntry, "id">): CountdownEntry {
    return {
        guildId: "guild-1",
        channelId: "channel-1",
        messageId: "m1",
        eventName: "Launch",
        description: null,
        imageUrl: null,
        color: null,
        footer: null,
        finishMessage: null,
        mentionRoleId: null,
        targetTime: new Date(Date.now() + 86_400_000),
        createdBy: "user-1",
        createdAt: new Date(),
        ...partial,
    }
}

async function boot(entries: CountdownEntry[] = []) {
    cache = Object.fromEntries(entries.map((row) => [row.id, row]))
    resetCountdownStoreForTests()
    setCountdownStoreDbForTests({
        getAllCountdownsFromDatabase: async () => structuredClone(cache),
        createCountdown: async (input) => {
            if (failCreate) throw new Error("db down")
            return entry({ ...input, id: 7 })
        },
        deleteCountdown: async () => true,
    })
    await initializeCountdownStore()
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

function postableChannel(input?: { hasPerms?: boolean; send?: () => Promise<unknown> | null }) {
    return {
        id: "channel-1",
        isTextBased: () => true,
        isDMBased: () => false,
        toString: () => "<#channel-1>",
        permissionsFor: () => ({ has: () => input?.hasPerms !== false }),
        send:
            input?.send ??
            (async () => ({
                id: "ph-1",
                edit: async () => undefined,
                delete: async () => undefined,
            })),
    }
}

function clientWith(channel: unknown | null, user: BotClient["user"] | null = undefined) {
    const client = createBotClientFake(user === null ? { user: null } : {})
    const raw = client as unknown as { channels: { fetch: (id: string) => Promise<unknown> } }
    raw.channels.fetch = async () => channel
    return client
}

const future = () => Math.floor(Date.now() / 1000) + 3600

describe("countdown", () => {
    it("requires a server", async () => {
        const { interaction, calls } = createSlashInteraction({ guild: null, subcommand: "list" })
        await countdown.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), ["Use this command in a server."])
    })

    it("rejects an unknown subcommand", async () => {
        const { interaction, calls } = createSlashInteraction({ subcommand: "nope" })
        await countdown.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), ["Unknown subcommand."])
    })

    it("reports an unexpected failure", async () => {
        resetCountdownStoreForTests()
        const { interaction, calls } = createSlashInteraction({ subcommand: "list" })
        await countdown.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), ["An error occurred while processing your request."])
    })

    it("requires date and time together", async () => {
        await boot()
        const { interaction, calls } = createSlashInteraction({
            subcommand: "create",
            options: { event_name: "Launch", date: "2026-12-25" },
        })
        await countdown.execute(interaction, clientWith(postableChannel()))
        assert.deepEqual(texts(calls), [
            "Provide both `date` and `time` together (or use `timestamp` instead).",
        ])
    })

    it("repeats an invalid date error", async () => {
        await boot()
        const { interaction, calls } = createSlashInteraction({
            subcommand: "create",
            options: { event_name: "Launch", date: "12-25-2026", time: "18:30" },
        })
        await countdown.execute(interaction, clientWith(postableChannel()))
        assert.deepEqual(texts(calls), ["Date must be in `YYYY-MM-DD` format (e.g. `2026-12-25`)."])
    })

    it("requires a target time", async () => {
        await boot()
        const { interaction, calls } = createSlashInteraction({
            subcommand: "create",
            options: { event_name: "Launch" },
        })
        await countdown.execute(interaction, clientWith(postableChannel()))
        assert.deepEqual(texts(calls), [
            "Provide a target time: either `date` + `time`, or a Unix `timestamp`.",
        ])
    })

    it("rejects a target time in the past", async () => {
        await boot()
        const { interaction, calls } = createSlashInteraction({
            subcommand: "create",
            options: { event_name: "Launch", timestamp: 10 },
        })
        await countdown.execute(interaction, clientWith(postableChannel()))
        assert.deepEqual(texts(calls), ["The target time must be in the future."])
    })

    it("rejects an image URL that is not http(s)", async () => {
        await boot()
        const { interaction, calls } = createSlashInteraction({
            subcommand: "create",
            options: {
                event_name: "Launch",
                timestamp: future(),
                image_url: "ftp://example.com/a.png",
            },
        })
        await countdown.execute(interaction, clientWith(postableChannel()))
        assert.deepEqual(texts(calls), ["The image URL must be a valid http or https URL."])
    })

    it("requires a text channel in the server", async () => {
        await boot()
        const { interaction, calls } = createSlashInteraction({
            subcommand: "create",
            options: { event_name: "Launch", timestamp: future() },
        })
        await countdown.execute(interaction, clientWith(null))
        assert.deepEqual(texts(calls), [
            "The target channel must be a text channel in this server.",
        ])
    })

    it("says the bot user is not available yet", async () => {
        await boot()
        const { interaction, calls } = createSlashInteraction({
            subcommand: "create",
            options: { event_name: "Launch", timestamp: future() },
        })
        await countdown.execute(interaction, clientWith(postableChannel(), null))
        assert.deepEqual(texts(calls), ["Bot user is not available yet. Try again."])
    })

    it("lists the permissions needed in the target channel", async () => {
        await boot()
        const { interaction, calls } = createSlashInteraction({
            subcommand: "create",
            options: { event_name: "Launch", timestamp: future() },
        })
        await countdown.execute(interaction, clientWith(postableChannel({ hasPerms: false })))
        assert.deepEqual(texts(calls), [
            "I need View Channel, Send Messages, and Embed Links permissions in the target channel.",
        ])
    })

    it("says the countdown message could not be posted", async () => {
        await boot()
        const { interaction, calls } = createSlashInteraction({
            subcommand: "create",
            options: { event_name: "Launch", timestamp: future() },
        })
        await countdown.execute(
            interaction,
            clientWith(postableChannel({ send: async () => null }))
        )
        assert.deepEqual(texts(calls), [
            "Failed to post the countdown message. Check my permissions in that channel.",
        ])
    })

    it("confirms a countdown was created", async () => {
        await boot()
        const { interaction, calls } = createSlashInteraction({
            subcommand: "create",
            options: { event_name: "Launch", timestamp: future() },
        })
        await countdown.execute(interaction, clientWith(postableChannel()))
        assert.deepEqual(texts(calls), ["Created countdown **#7** for **Launch** in <#channel-1>."])
    })

    it("says there are no active countdowns", async () => {
        await boot()
        const { interaction, calls } = createSlashInteraction({ subcommand: "list" })
        await countdown.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), [
            "No active countdowns in this server. Use `/countdown create` to add one.",
        ])
    })

    it("lists active countdowns", async () => {
        await boot([entry({ id: 1, eventName: "Launch" })])
        const { interaction, calls } = createSlashInteraction({ subcommand: "list" })
        await countdown.execute(interaction, createBotClientFake())
        assert.equal(embedData(calls)?.title, "Active Countdowns")
    })

    it("marks a countdown whose target has passed", async () => {
        await boot([entry({ id: 2, targetTime: new Date(Date.now() - 60_000) })])
        const { interaction, calls } = createSlashInteraction({ subcommand: "list" })
        await countdown.execute(interaction, createBotClientFake())
        assert.match(embedData(calls)?.description ?? "", /Event started!/)
    })

    it("notes when the countdown list is truncated", async () => {
        const rows = Array.from({ length: 40 }, (_, index) =>
            entry({ id: index + 1, eventName: "E".repeat(200) })
        )
        await boot(rows)
        const { interaction, calls } = createSlashInteraction({ subcommand: "list" })
        await countdown.execute(interaction, createBotClientFake())
        assert.match(embedData(calls)?.description ?? "", /…and \d+ more countdowns/)
    })

    it("says the countdown id was not found", async () => {
        await boot()
        const { interaction, calls } = createSlashInteraction({
            subcommand: "delete",
            options: { countdown_id: 99 },
        })
        await countdown.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), ["No countdown **#99** found in this server."])
    })

    it("confirms a countdown was deleted", async () => {
        await boot([entry({ id: 5, eventName: "Launch" })])
        const { interaction, calls } = createSlashInteraction({
            subcommand: "delete",
            options: { countdown_id: 5 },
        })
        await countdown.execute(interaction, clientWith(null))
        assert.deepEqual(texts(calls), ["Deleted countdown **#5** (Launch)."])
    })
})
