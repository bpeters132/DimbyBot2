import assert from "node:assert/strict"
import { registerHooks } from "node:module"
import { afterEach, describe, it } from "node:test"
import { PermissionFlagsBits } from "discord.js"
import { downloadMetadataStoreKey } from "../../util/downloadMetadataKeys.js"
import {
    initializeDownloadMetadataStore,
    resetDownloadMetadataStoreForTests,
    setDownloadMetadataStoreDbForTests,
} from "../../util/downloadMetadataStore.js"
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
import type { ChatInputCommandInteraction } from "discord.js"
import type { DownloadsMetadataStore } from "../../types/index.js"

type DlGlobals = typeof globalThis & {
    __dlExists?: boolean
    __dlNames?: string[]
    __dlSize?: number
    __dlMtimeMs?: number
    __dlAccessCode?: string
    __dlUnlinkCode?: string
}

const g = globalThis as DlGlobals
let meta: DownloadsMetadataStore = {}
let failSave = false

registerHooks({
    resolve(specifier, context, nextResolve) {
        const parent = context.parentURL ?? ""
        if (
            specifier === "fs" &&
            (parent.includes("/commands/user/downloads.ts") ||
                parent.includes("/util/downloadArtifacts.ts"))
        ) {
            return {
                url: "data:text/javascript," + encodeURIComponent(fsSource),
                shortCircuit: true,
            }
        }
        return nextResolve(specifier, context)
    },
})

const fsSource = `
function existsSync() { return globalThis.__dlExists !== false }
function readdirSync() { return globalThis.__dlNames ?? [] }
function statSync() {
    return {
        size: globalThis.__dlSize ?? 2048,
        mtime: new Date(globalThis.__dlMtimeMs ?? 0),
        mtimeMs: globalThis.__dlMtimeMs ?? 0,
        isFile() { return true },
    }
}
function unlinkSync() {}
function mkdirSync() {}
const promises = {
    async access() {
        if (globalThis.__dlAccessCode) {
            const err = new Error("access")
            err.code = globalThis.__dlAccessCode
            throw err
        }
    },
    async stat() {
        return {
            size: globalThis.__dlSize ?? 2048,
            mtime: new Date(globalThis.__dlMtimeMs ?? Date.now()),
        }
    },
    async unlink() {
        if (globalThis.__dlUnlinkCode) {
            const err = new Error("unlink")
            err.code = globalThis.__dlUnlinkCode
            throw err
        }
    },
}
export { existsSync, readdirSync, statSync, unlinkSync, mkdirSync, promises }
export default { existsSync, readdirSync, statSync, unlinkSync, mkdirSync, promises }
`

const { default: downloads } = await import("./downloads.js")

function texts(calls: RecordedMessage[]): string[] {
    return messageContents(calls).filter((value): value is string => typeof value === "string")
}

async function bootMeta() {
    resetDownloadMetadataStoreForTests()
    setDownloadMetadataStoreDbForTests({
        getDownloadMetadataStoreFromDatabase: async () => structuredClone(meta),
        replaceDownloadMetadataStoreInDatabase: async () => {
            if (failSave) throw new Error("db down")
            return { skippedEntries: [], rowsWritten: 1, rowsDeleted: 0 }
        },
    })
    await initializeDownloadMetadataStore()
}

async function bootSettings() {
    resetGuildSettingsStoreForTests()
    setGuildSettingsStoreDbForTests({
        getGuildSettingsStoreFromDatabase: async () => ({}),
        replaceGuildSettingsStoreInDatabase: async () => ({
            rowsUpserted: 1,
            rowsDeleted: 0,
            rowsAffected: 1,
        }),
    })
    await initializeGuildSettingsStore()
}

function permit(interaction: ChatInputCommandInteraction, allowed: boolean) {
    const raw = interaction as unknown as {
        memberPermissions: { has: (permission: unknown) => boolean }
    }
    raw.memberPermissions = {
        has: (permission) => (permission === PermissionFlagsBits.ManageGuild ? allowed : false),
    }
}

afterEach(() => {
    resetDownloadMetadataStoreForTests()
    setDownloadMetadataStoreDbForTests(null)
    resetGuildSettingsStoreForTests()
    setGuildSettingsStoreDbForTests(null)
    meta = {}
    failSave = false
    delete g.__dlExists
    delete g.__dlNames
    delete g.__dlSize
    delete g.__dlMtimeMs
    delete g.__dlAccessCode
    delete g.__dlUnlinkCode
})

describe("downloads", () => {
    it("requires a server", async () => {
        const { interaction, calls } = createSlashInteraction({ guild: null, subcommand: "list" })
        await downloads.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), ["Use this command in a server."])
    })

    it("says the downloads directory was not found", async () => {
        g.__dlExists = false
        const { interaction, calls } = createSlashInteraction({ subcommand: "list" })
        await downloads.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), ["No downloads directory found."])
    })

    it("says no downloaded files were found", async () => {
        await bootMeta()
        const { interaction, calls } = createSlashInteraction({ subcommand: "list" })
        await downloads.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), ["No downloaded files found for this server."])
    })

    it("lists downloaded files", async () => {
        g.__dlSize = 2 * 1024 * 1024
        meta = {
            [downloadMetadataStoreKey("guild-1", "song.wav")]: {
                downloadDate: new Date().toISOString(),
                originalUrl: "https://youtu.be/abc",
                filePath: "downloads/song.wav",
                guildId: "guild-1",
            },
        }
        await bootMeta()
        await bootSettings()
        const { interaction, calls } = createSlashInteraction({ subcommand: "list" })
        await downloads.execute(interaction, createBotClientFake())
        const content = texts(calls)[0] ?? ""
        assert.match(content, /\*\*Downloaded Files \(1\)\*\*/)
        assert.match(content, /\*\*song\*\*/)
    })

    it("requires Manage Server to clean up files", async () => {
        await bootMeta()
        const { interaction, calls } = createSlashInteraction({ subcommand: "cleanup" })
        permit(interaction, false)
        await downloads.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), [
            "You need the **Manage Server** permission to clean up downloaded files.",
        ])
    })

    it("rejects a non-positive days value", async () => {
        await bootMeta()
        const { interaction, calls } = createSlashInteraction({
            subcommand: "cleanup",
            options: { days: 0 },
        })
        permit(interaction, true)
        await downloads.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), [
            "Cleanup cancelled: **days** must be a positive integer (or omit for 7 days).",
        ])
    })

    it("says no files are older than the cutoff", async () => {
        meta = {
            [downloadMetadataStoreKey("guild-1", "song.wav")]: {
                downloadDate: new Date().toISOString(),
                filePath: "downloads/song.wav",
                guildId: "guild-1",
            },
        }
        await bootMeta()
        const { interaction, calls } = createSlashInteraction({ subcommand: "cleanup" })
        permit(interaction, true)
        await downloads.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), ["No files older than 7 days found for this server."])
    })

    it("confirms files older than the cutoff were removed", async () => {
        g.__dlSize = 2 * 1024 * 1024
        meta = {
            [downloadMetadataStoreKey("guild-1", "song.wav")]: {
                downloadDate: new Date(0).toISOString(),
                filePath: "downloads/song.wav",
                guildId: "guild-1",
            },
        }
        await bootMeta()
        const { interaction, calls } = createSlashInteraction({ subcommand: "cleanup" })
        permit(interaction, true)
        await downloads.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), ["Cleaned up 1 files (2.00MB) older than 7 days."])
    })

    it("confirms every downloaded file was removed", async () => {
        g.__dlSize = 2 * 1024 * 1024
        meta = {
            [downloadMetadataStoreKey("guild-1", "song.wav")]: {
                downloadDate: new Date().toISOString(),
                filePath: "downloads/song.wav",
                guildId: "guild-1",
            },
        }
        await bootMeta()
        const { interaction, calls } = createSlashInteraction({
            subcommand: "cleanup",
            options: { all: true },
        })
        permit(interaction, true)
        await downloads.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), ["Removed 1 files (2.00MB) for this server."])
    })

    it("warns when cleanup metadata could not be saved", async () => {
        g.__dlSize = 2 * 1024 * 1024
        failSave = true
        meta = {
            [downloadMetadataStoreKey("guild-1", "song.wav")]: {
                downloadDate: new Date(0).toISOString(),
                filePath: "downloads/song.wav",
                guildId: "guild-1",
            },
        }
        await bootMeta()
        const { interaction, calls } = createSlashInteraction({ subcommand: "cleanup" })
        permit(interaction, true)
        await downloads.execute(interaction, createBotClientFake())
        assert.match(
            texts(calls)[0] ?? "",
            /Warning: metadata cleanup could not be persisted to the database/
        )
    })

    it("lists files that could not be deleted", async () => {
        g.__dlUnlinkCode = "EACCES"
        g.__dlSize = 1024
        meta = {
            [downloadMetadataStoreKey("guild-1", "song.wav")]: {
                downloadDate: new Date(0).toISOString(),
                filePath: "downloads/song.wav",
                guildId: "guild-1",
            },
        }
        await bootMeta()
        const { interaction, calls } = createSlashInteraction({ subcommand: "cleanup" })
        permit(interaction, true)
        await downloads.execute(interaction, createBotClientFake())
        assert.match(texts(calls)[0] ?? "", /song\.wav: Could not delete this file\./)
    })

    it("lists orphan files that could not be deleted", async () => {
        g.__dlNames = ["guild-1_orphan.wav"]
        g.__dlMtimeMs = 0
        g.__dlUnlinkCode = "EACCES"
        await bootMeta()
        const { interaction, calls } = createSlashInteraction({ subcommand: "cleanup" })
        permit(interaction, true)
        await downloads.execute(interaction, createBotClientFake())
        assert.match(texts(calls)[0] ?? "", /guild-1_orphan\.wav: Could not delete orphan file\./)
    })

    it("reports an unexpected downloads failure", async () => {
        resetDownloadMetadataStoreForTests()
        const { interaction, calls } = createSlashInteraction({ subcommand: "list" })
        await downloads.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), ["An unexpected error occurred while running /downloads."])
    })
})
