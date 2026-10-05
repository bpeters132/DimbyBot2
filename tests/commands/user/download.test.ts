import assert from "node:assert/strict"
import path from "node:path"
import { registerHooks } from "node:module"
import { afterEach, beforeEach, describe, it, mock } from "node:test"
import { DOWNLOAD_PROCESS_TIMEOUT_MS } from "../../../src/util/downloadArtifacts.js"
import {
    initializeDownloadMetadataStore,
    resetDownloadMetadataStoreForTests,
    setDownloadMetadataStoreDbForTests,
} from "../../../src/util/downloadMetadataStore.js"
import {
    initializeGuildSettingsStore,
    resetGuildSettingsStoreForTests,
    setGuildSettingsStoreDbForTests,
} from "../../../src/util/saveControlChannel.js"
import {
    createBotClientFake,
    createSlashInteraction,
    messageContents,
    type RecordedMessage,
} from "../../test-support/commandFakes.js"
import type { ChatInputCommandInteraction } from "discord.js"
import type BotClient from "../../../src/lib/BotClient.js"

type DownloadGlobals = typeof globalThis & {
    __downloadSpawnMode?: string
    __downloadChild?: {
        stdout: { emit: (event: string, data: Buffer) => boolean }
        emit: (event: string, code?: number | null) => boolean
        closed?: boolean
        pid?: number
    }
    __downloadSpawnArgs?: [string, string[]]
    __downloadFsExists?: boolean
    __downloadFsNames?: string[]
    __downloadFsSize?: number
    __downloadFsStatThrow?: boolean
    __onDownloadStat?: () => void
    __playMode?: string
    __playFeedback?: string
    __beforeDownloadSpawnThrow?: () => void
}

const g = globalThis as DownloadGlobals
const YT = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"

registerHooks({
    resolve(specifier, context, nextResolve) {
        const parent = context.parentURL ?? ""
        if (!parent.includes("/commands/user/download.ts")) {
            return nextResolve(specifier, context)
        }
        if (specifier === "fs" || specifier === "node:fs") {
            return {
                url: "data:text/javascript," + encodeURIComponent(fsSource),
                shortCircuit: true,
            }
        }
        if (specifier === "child_process") {
            return {
                url: "data:text/javascript," + encodeURIComponent(spawnSource),
                shortCircuit: true,
            }
        }
        if (specifier.endsWith("musicManager.js")) {
            return {
                url: "data:text/javascript," + encodeURIComponent(playSource),
                shortCircuit: true,
            }
        }
        return nextResolve(specifier, context)
    },
})

const fsSource = `
function existsSync() { return globalThis.__downloadFsExists !== false }
function mkdirSync() {}
function readdirSync() { return globalThis.__downloadFsNames ?? [] }
function unlinkSync() {}
function statSync() {
    if (typeof globalThis.__onDownloadStat === "function") globalThis.__onDownloadStat()
    if (globalThis.__downloadFsStatThrow) {
        const err = new Error("stat failed")
        err.code = "EIO"
        throw err
    }
    return {
        size: globalThis.__downloadFsSize ?? 128,
        mtime: new Date(),
        isFile() { return true },
    }
}
export { existsSync, mkdirSync, readdirSync, unlinkSync, statSync }
export default { existsSync, mkdirSync, readdirSync, unlinkSync, statSync }
`

const spawnSource = `
import { EventEmitter } from "node:events"
export function spawn(command, args) {
    const mode = globalThis.__downloadSpawnMode ?? "idle"
    if (mode === "throw") {
        if (typeof globalThis.__beforeDownloadSpawnThrow === "function") {
            globalThis.__beforeDownloadSpawnThrow()
        }
        throw new Error("ENOENT")
    }
    const child = new EventEmitter()
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    child.pid = mode === "no-pid" ? 0 : 42
    child.kill = () => {}
    globalThis.__downloadChild = child
    globalThis.__downloadSpawnArgs = [command, args]
    return child
}
`

const playSource = `
export async function handleQueryAndPlay() {
    if (globalThis.__playMode === "throw") throw new Error("play failed")
    return { success: true, feedbackText: globalThis.__playFeedback ?? "" }
}
`

const { default: download } = await import("../../../src/commands/user/download.js")

function texts(calls: RecordedMessage[]): string[] {
    return messageContents(calls).filter((value): value is string => typeof value === "string")
}

async function bootStores() {
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
    resetDownloadMetadataStoreForTests()
    setDownloadMetadataStoreDbForTests({
        getDownloadMetadataStoreFromDatabase: async () => ({}),
        replaceDownloadMetadataStoreInDatabase: async () => ({
            skippedEntries: [],
            rowsWritten: 1,
            rowsDeleted: 0,
        }),
    })
    await initializeDownloadMetadataStore()
}

function arm(client: BotClient, createPlayer?: () => unknown) {
    const raw = client as unknown as {
        lavalink: {
            createPlayer: (opts: unknown) => unknown
            destroyPlayer: (guildId: string) => Promise<void>
        }
    }
    raw.lavalink.createPlayer = createPlayer ?? (() => ({ queue: { tracks: [] } }))
    raw.lavalink.destroyPlayer = async () => undefined
    return client
}

function ready(input: Parameters<typeof createSlashInteraction>[0] = {}) {
    return createSlashInteraction({
        ...input,
        options: { url: YT, ...(input.options ?? {}) },
    })
}

async function settle() {
    for (let i = 0; i < 8; i += 1) {
        await new Promise((resolve) => setImmediate(resolve))
    }
}

function closeChild(code: number | null) {
    const child = g.__downloadChild
    if (!child || child.closed) return
    child.closed = true
    child.emit("close", code)
}

function runPrefix(args: string[]): string {
    const template = args[args.indexOf("-o") + 1]
    const dir = path.join(process.cwd(), "downloads")
    let rest = template.slice(dir.length)
    if (rest.startsWith("/") || rest.startsWith("\\")) rest = rest.slice(1)
    const marker = "%(title)s.%(ext)s"
    if (!rest.endsWith(marker)) throw new Error(`unexpected output template ${template}`)
    return rest.slice(0, -marker.length)
}

async function runSpawn(
    interaction: ChatInputCommandInteraction,
    client: BotClient,
    drive: (args: string[]) => void | Promise<void>
) {
    await download.execute(interaction, client)
    const args = g.__downloadSpawnArgs?.[1] ?? []
    await drive(args)
    await settle()
}

const playbackChannel = {
    id: "channel-1",
    isTextBased: () => true,
    isDMBased: () => false,
}

const idleGuild = { id: "guild-1", members: {} } as { id: string }

beforeEach(async () => {
    delete g.__downloadSpawnMode
    delete g.__downloadChild
    delete g.__downloadSpawnArgs
    delete g.__downloadFsExists
    delete g.__downloadFsNames
    delete g.__downloadFsSize
    delete g.__downloadFsStatThrow
    delete g.__onDownloadStat
    delete g.__playMode
    delete g.__playFeedback
    delete g.__beforeDownloadSpawnThrow
    await bootStores()
})

afterEach(() => {
    closeChild(1)
    mock.timers.reset()
    resetGuildSettingsStoreForTests()
    setGuildSettingsStoreDbForTests(null)
    resetDownloadMetadataStoreForTests()
    setDownloadMetadataStoreDbForTests(null)
})

describe("download", () => {
    it("requires a server", async () => {
        const { interaction, calls } = createSlashInteraction({
            guild: null,
            options: { url: YT },
        })
        await download.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), ["Use this command in a server."])
    })

    it("asks the user to retry when their member profile is missing", async () => {
        const { interaction, calls } = createSlashInteraction({
            inCachedGuild: false,
            options: { url: YT },
        })
        await download.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), ["Could not resolve your member profile. Try again."])
    })

    it("requires a voice channel", async () => {
        const { interaction, calls } = createSlashInteraction({
            member: { voice: { channel: null } },
            options: { url: YT },
        })
        await download.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), ["You need to be in a voice channel to use this command."])
    })

    it("requires a YouTube URL", async () => {
        const { interaction, calls } = createSlashInteraction({
            options: { url: "https://example.com/watch" },
        })
        await download.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), ["Please provide a valid YouTube URL."])
    })

    it("says it is preparing the workspace", async () => {
        g.__downloadSpawnMode = "throw"
        const { interaction, calls } = ready()
        await download.execute(interaction, createBotClientFake())
        assert.ok(texts(calls).includes("Starting download... Preparing workspace."))
    })

    it("says it is cleaning old downloads", async () => {
        g.__downloadSpawnMode = "throw"
        const { interaction, calls } = ready()
        await download.execute(interaction, createBotClientFake())
        assert.ok(texts(calls).includes("Cleaning old downloads..."))
    })

    it("says audio download is starting", async () => {
        g.__downloadSpawnMode = "throw"
        const { interaction, calls } = ready()
        await download.execute(interaction, createBotClientFake())
        assert.ok(texts(calls).includes("Downloading audio... This can take a moment."))
    })

    it("says yt-dlp could not be started", async () => {
        mock.timers.enable({ apis: ["Date"] })
        g.__downloadSpawnMode = "throw"
        g.__beforeDownloadSpawnThrow = () => {
            mock.timers.tick(2_000)
        }
        const { interaction, calls } = ready()
        await download.execute(interaction, createBotClientFake())
        assert.ok(
            texts(calls).includes(
                "Failed to start download process: yt-dlp not found or could not be executed."
            )
        )
    })

    it("shows download progress", async () => {
        mock.timers.enable({ apis: ["Date"] })
        const { interaction, calls } = ready()
        await runSpawn(interaction, createBotClientFake(), () => {
            mock.timers.tick(2_000)
            g.__downloadChild?.stdout.emit(
                "data",
                Buffer.from("[download] 50.0% of 10.0MiB at 1.0MiB/s ETA 00:01\n")
            )
            closeChild(1)
        })
        assert.ok(
            texts(calls).some((line) =>
                line.startsWith("Downloading... 50.0%\n`[██████████░░░░░░░░░░]`")
            )
        )
    })

    it("says the download timed out", async () => {
        mock.timers.enable({ apis: ["setTimeout"] })
        const { interaction, calls } = ready()
        const pending = download.execute(interaction, createBotClientFake())
        await pending
        mock.timers.tick(DOWNLOAD_PROCESS_TIMEOUT_MS + 5)
        closeChild(null)
        await settle()
        assert.ok(
            texts(calls).includes(
                "Download timed out. Try a shorter video, or contact an admin if this keeps happening."
            )
        )
    })

    it("says the video could not be downloaded", async () => {
        const { interaction, calls } = ready()
        await runSpawn(interaction, createBotClientFake(), () => {
            closeChild(1)
        })
        assert.ok(
            texts(calls).includes(
                "Error downloading video. It may be too long, live, or otherwise rejected by size limits. Try a shorter YouTube URL."
            )
        )
    })

    it("says it is finalizing the file", async () => {
        const { interaction, calls } = ready()
        await runSpawn(interaction, createBotClientFake(), () => {
            closeChild(0)
        })
        assert.ok(texts(calls).includes("Download complete. Finalizing file..."))
    })

    it("says the downloaded file could not be found", async () => {
        const { interaction, calls } = ready()
        await runSpawn(interaction, createBotClientFake(), () => {
            closeChild(0)
        })
        assert.ok(
            texts(calls).includes(
                "Could not find the downloaded file after the download process. Please check logs."
            )
        )
    })

    it("says the output file could not be verified", async () => {
        const dir = path.join(process.cwd(), "downloads")
        const { interaction, calls } = ready()
        await runSpawn(interaction, createBotClientFake(), () => {
            g.__downloadChild?.stdout.emit("data", Buffer.from(`${dir}/other.wav\n`))
            closeChild(0)
        })
        assert.ok(
            texts(calls).includes(
                "Download finished but the output file could not be verified. Please try again."
            )
        )
    })

    it("says the file could not be verified after a stat failure", async () => {
        g.__downloadFsStatThrow = true
        const dir = path.join(process.cwd(), "downloads")
        const { interaction, calls } = ready()
        await runSpawn(interaction, createBotClientFake(), (args) => {
            const prefix = runPrefix(args)
            g.__downloadChild?.stdout.emit("data", Buffer.from(`${dir}/${prefix}Song.wav\n`))
            closeChild(0)
        })
        assert.ok(
            texts(calls).includes(
                "Download finished but the file could not be verified. Please try again."
            )
        )
    })

    it("rejects a file over the server download limit", async () => {
        g.__downloadFsSize = 1000 * 1024 * 1024 + 1
        const dir = path.join(process.cwd(), "downloads")
        const { interaction, calls } = ready()
        await runSpawn(interaction, createBotClientFake(), (args) => {
            const prefix = runPrefix(args)
            g.__downloadChild?.stdout.emit("data", Buffer.from(`${dir}/${prefix}Song.wav\n`))
            closeChild(0)
        })
        assert.ok(
            texts(calls).includes(
                "Download rejected: the resulting file exceeds this server's download limit (1000MB). Try a shorter video."
            )
        )
    })

    it("says the file was saved and the library is updating", async () => {
        const dir = path.join(process.cwd(), "downloads")
        const { interaction, calls } = ready({
            guild: {
                id: "guild-1",
                members: { me: { voice: { channelId: "voice-other" } } },
            } as { id: string },
        })
        await runSpawn(interaction, createBotClientFake(), (args) => {
            const prefix = runPrefix(args)
            g.__downloadChild?.stdout.emit("data", Buffer.from(`${dir}/${prefix}Song.wav\n`))
            closeChild(0)
        })
        assert.ok(texts(calls).some((line) => line.includes("Updating library...")))
    })

    it("says the user must be in the bot's voice channel to auto-play", async () => {
        const dir = path.join(process.cwd(), "downloads")
        const { interaction, calls } = ready({
            guild: {
                id: "guild-1",
                members: { me: { voice: { channelId: "voice-other" } } },
            } as { id: string },
        })
        let saved = ""
        await runSpawn(interaction, createBotClientFake(), (args) => {
            const prefix = runPrefix(args)
            saved = `${prefix}Song`
            g.__downloadChild?.stdout.emit("data", Buffer.from(`${dir}/${prefix}Song.wav\n`))
            closeChild(0)
        })
        assert.ok(
            texts(calls).some((line) =>
                line.includes(
                    `Saved as **${saved}**.\nYou need to be in the same voice channel as the bot to auto-play.`
                )
            )
        )
    })

    it("says it is attempting to play the download", async () => {
        const dir = path.join(process.cwd(), "downloads")
        const { interaction, calls } = ready({ channel: playbackChannel, guild: idleGuild })
        await runSpawn(interaction, arm(createBotClientFake()), (args) => {
            const prefix = runPrefix(args)
            g.__downloadChild?.stdout.emit("data", Buffer.from(`${dir}/${prefix}Song.wav\n`))
            closeChild(0)
        })
        assert.ok(texts(calls).includes("Attempting to play the downloaded track..."))
    })

    it("says the channel cannot be used for playback feedback", async () => {
        const dir = path.join(process.cwd(), "downloads")
        const { interaction, calls } = ready({
            channel: { id: "channel-1", isTextBased: () => false, isDMBased: () => false },
            guild: idleGuild,
        })
        await runSpawn(interaction, createBotClientFake(), (args) => {
            const prefix = runPrefix(args)
            g.__downloadChild?.stdout.emit("data", Buffer.from(`${dir}/${prefix}Song.wav\n`))
            closeChild(0)
        })
        assert.ok(
            texts(calls).includes(
                "Download finished but this channel cannot be used for playback feedback."
            )
        )
    })

    it("says the music player could not be started", async () => {
        const dir = path.join(process.cwd(), "downloads")
        const { interaction, calls } = ready({ channel: playbackChannel, guild: idleGuild })
        await runSpawn(
            interaction,
            arm(createBotClientFake(), () => null),
            (args) => {
                const prefix = runPrefix(args)
                g.__downloadChild?.stdout.emit("data", Buffer.from(`${dir}/${prefix}Song.wav\n`))
                closeChild(0)
            }
        )
        assert.ok(texts(calls).includes("Could not start the music player."))
    })

    it("says playback status was updated", async () => {
        const dir = path.join(process.cwd(), "downloads")
        const { interaction, calls } = ready({ channel: playbackChannel, guild: idleGuild })
        await runSpawn(interaction, arm(createBotClientFake()), (args) => {
            const prefix = runPrefix(args)
            g.__downloadChild?.stdout.emit("data", Buffer.from(`${dir}/${prefix}Song.wav\n`))
            closeChild(0)
        })
        assert.ok(texts(calls).includes("Download complete. Playback status updated."))
    })

    it("says the song was downloaded but could not be played", async () => {
        g.__playMode = "throw"
        const dir = path.join(process.cwd(), "downloads")
        const { interaction, calls } = ready({ channel: playbackChannel, guild: idleGuild })
        let base = ""
        await runSpawn(interaction, arm(createBotClientFake()), (args) => {
            const prefix = runPrefix(args)
            base = `${prefix}Song`
            g.__downloadChild?.stdout.emit("data", Buffer.from(`${dir}/${prefix}Song.wav\n`))
            closeChild(0)
        })
        assert.ok(
            texts(calls).some((line) =>
                line.includes(
                    `Downloaded: **${base}**\nCould not automatically play the song: An error occurred while processing your request.`
                )
            )
        )
    })

    it("says finalizing the download failed", async () => {
        const dir = path.join(process.cwd(), "downloads")
        g.__onDownloadStat = () => {
            resetDownloadMetadataStoreForTests()
        }
        const { interaction, calls } = ready()
        await runSpawn(interaction, createBotClientFake(), (args) => {
            const prefix = runPrefix(args)
            g.__downloadChild?.stdout.emit("data", Buffer.from(`${dir}/${prefix}Song.wav\n`))
            closeChild(0)
        })
        assert.ok(
            texts(calls).includes(
                "An unexpected error occurred while finalizing the download. Please try again later."
            )
        )
    })

    it("says the download failed", async () => {
        resetGuildSettingsStoreForTests()
        const { interaction, calls } = ready()
        await download.execute(interaction, createBotClientFake())
        assert.ok(
            texts(calls).includes("Failed to download video. Please try again or contact support.")
        )
    })
})
