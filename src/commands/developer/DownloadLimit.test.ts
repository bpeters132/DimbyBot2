import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"
import downloadLimit from "./DownloadLimit.js"
import { DEFAULT_DOWNLOADS_MAX_MB } from "../../util/downloadsMaxMb.js"
import {
    initializeGuildSettingsStore,
    resetGuildSettingsStoreForTests,
    setGuildSettingsStoreDbForTests,
} from "../../util/saveControlChannel.js"
import {
    createBotClientFake,
    createSlashInteraction,
    messageContents,
    type RecordedMessage,
} from "../../test-support/commandFakes.js"
import type { GuildSettingsStore } from "../../types/index.js"

const OWNER = "owner-1"
const previousOwner = process.env.OWNER_ID
let store: GuildSettingsStore = {}
let failSave = false

afterEach(() => {
    if (previousOwner === undefined) delete process.env.OWNER_ID
    else process.env.OWNER_ID = previousOwner
    resetGuildSettingsStoreForTests()
    setGuildSettingsStoreDbForTests(null)
    store = {}
    failSave = false
})

async function bootSettings() {
    resetGuildSettingsStoreForTests()
    setGuildSettingsStoreDbForTests({
        getGuildSettingsStoreFromDatabase: async () => structuredClone(store),
        replaceGuildSettingsStoreInDatabase: async () => {
            if (failSave) throw new Error("db down")
            return { rowsUpserted: 1, rowsDeleted: 0, rowsAffected: 1 }
        },
    })
    await initializeGuildSettingsStore()
}

function texts(calls: RecordedMessage[]): string[] {
    return messageContents(calls).filter((value): value is string => typeof value === "string")
}

describe("downloadlimit", () => {
    it("reports a missing developer id", async () => {
        delete process.env.OWNER_ID
        const { interaction, calls } = createSlashInteraction({ subcommand: "show" })
        await downloadLimit.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), ["Command configuration error: Developer ID not set."])
    })

    it("denies users who are not the owner", async () => {
        process.env.OWNER_ID = OWNER
        const { interaction, calls } = createSlashInteraction({
            userId: "someone-else",
            subcommand: "show",
        })
        await downloadLimit.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), [
            "Sorry, this command can only be used by the bot developer.",
        ])
    })

    it("requires a guild id outside a server", async () => {
        process.env.OWNER_ID = OWNER
        const { interaction, calls } = createSlashInteraction({
            guild: null,
            userId: OWNER,
            subcommand: "show",
        })
        await downloadLimit.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), [
            "Guild ID is required when running this command outside a guild.",
        ])
    })

    it("says guild settings are not loaded yet", async () => {
        process.env.OWNER_ID = OWNER
        resetGuildSettingsStoreForTests()
        const { interaction, calls } = createSlashInteraction({ userId: OWNER, subcommand: "show" })
        await downloadLimit.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), [
            "Guild settings are not loaded yet (bot may still be starting). Please try again shortly.",
        ])
    })

    it("shows the default download limit", async () => {
        process.env.OWNER_ID = OWNER
        await bootSettings()
        const { interaction, calls } = createSlashInteraction({ userId: OWNER, subcommand: "show" })
        await downloadLimit.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), [
            `Download limit for guild guild-1: ${DEFAULT_DOWNLOADS_MAX_MB}MB (default).`,
        ])
    })

    it("shows a custom download limit", async () => {
        process.env.OWNER_ID = OWNER
        store = { "guild-1": { downloadsMaxMb: 25 } }
        await bootSettings()
        const { interaction, calls } = createSlashInteraction({ userId: OWNER, subcommand: "show" })
        await downloadLimit.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), ["Download limit for guild guild-1: 25MB (custom)."])
    })

    it("confirms a saved download limit", async () => {
        process.env.OWNER_ID = OWNER
        await bootSettings()
        const { interaction, calls } = createSlashInteraction({
            userId: OWNER,
            subcommand: "set",
            options: { size_mb: 25 },
        })
        await downloadLimit.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), ["Set download limit for guild guild-1 to 25MB."])
    })

    it("warns when a new limit could not be saved", async () => {
        process.env.OWNER_ID = OWNER
        failSave = true
        await bootSettings()
        const { interaction, calls } = createSlashInteraction({
            userId: OWNER,
            subcommand: "set",
            options: { size_mb: 25 },
        })
        await downloadLimit.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), [
            "Updated limit in memory for guild guild-1 to 25MB, but **could not save** settings to database.",
        ])
    })

    it("confirms a custom limit was cleared", async () => {
        process.env.OWNER_ID = OWNER
        store = { "guild-1": { downloadsMaxMb: 25 } }
        await bootSettings()
        const { interaction, calls } = createSlashInteraction({
            userId: OWNER,
            subcommand: "clear",
        })
        await downloadLimit.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), [
            `Cleared custom download limit for guild guild-1. Default is ${DEFAULT_DOWNLOADS_MAX_MB}MB.`,
        ])
    })

    it("warns when clearing a limit could not be saved", async () => {
        process.env.OWNER_ID = OWNER
        store = { "guild-1": { downloadsMaxMb: 25 } }
        failSave = true
        await bootSettings()
        const { interaction, calls } = createSlashInteraction({
            userId: OWNER,
            subcommand: "clear",
        })
        await downloadLimit.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), [
            "Cleared limit in memory for guild guild-1, but **could not save** settings to database.",
        ])
    })

    it("rejects an unknown subcommand", async () => {
        process.env.OWNER_ID = OWNER
        await bootSettings()
        const { interaction, calls } = createSlashInteraction({
            userId: OWNER,
            subcommand: "nope",
        })
        await downloadLimit.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), ["Unknown subcommand: nope."])
    })
})
