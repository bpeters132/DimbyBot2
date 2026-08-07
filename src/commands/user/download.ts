import { SlashCommandBuilder } from "discord.js"
import type { ChatInputCommandInteraction } from "discord.js"
import { spawn } from "child_process"
import { randomBytes } from "crypto"
import path from "path"
import fs from "fs"
import type BotClient from "../../lib/BotClient.js"
import { withGuildPlayerLifecycleReservation } from "../../util/guildPlayerQueueLock.js"
import { handleQueryAndPlay } from "../../util/musicManager.js"
import { getGuildSettings } from "../../util/saveControlChannel.js"
import { guildMemberFromInteraction } from "../../util/guildMember.js"
import {
    memberMayJoinOccupiedVoice,
    resolveOccupiedVoiceChannelId,
} from "../../util/sameVoiceChannel.js"
import type { DownloadsMetadataStore } from "../../types/index.js"
import {
    downloadMetadataEntryMatchesGuild,
    downloadMetadataKeysForFile,
    downloadMetadataStoreKey,
    parseDownloadMetadataStoreKey,
} from "../../util/downloadMetadataKeys.js"
import {
    getDownloadMetadataStore,
    saveDownloadMetadataStore,
} from "../../util/downloadMetadataStore.js"
import {
    DOWNLOAD_PROCESS_TIMEOUT_MS,
    UNTRACKED_DOWNLOAD_ORPHAN_AGE_MS,
    guildDownloadFilePrefix,
    isResolvedPathInsideDir,
    listAgedUntrackedGuildDownloadFiles,
    removeDownloadFilesWithPrefix,
} from "../../util/downloadArtifacts.js"

// Maximum age of files in days before automatic cleanup
const MAX_FILE_AGE_DAYS = 7

// Maximum total size of downloads directory in MB (default fallback)
const DEFAULT_MAX_DIR_SIZE_MB = 1000

/**
 * Rough upper bound on WAV output (~10 MiB/min for 16-bit 44.1kHz stereo).
 * Used only for yt-dlp duration filtering before download starts.
 */
const APPROX_WAV_MIB_PER_MINUTE = 10

/**
 * Resolves the configured downloads size limit for a guild.
 * @param {import('../../lib/BotClient.js').default} client The bot client instance.
 * @param {string} guildId The guild ID to read settings for.
 * @returns {number} The max directory size in MB.
 */
function getMaxDirSizeMb(client: BotClient, guildId: string) {
    const settings = getGuildSettings()
    const guildSettings = settings[guildId] || {}
    const configured = guildSettings.downloadsMaxMb
    const parsed = Number.parseFloat(String(configured ?? ""))
    if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MAX_DIR_SIZE_MB
    return parsed
}

/** Max accepted on-disk size for one download (guild quota, in bytes). */
function getMaxDownloadBytes(maxDirSizeMb: number): number {
    return Math.max(1, maxDirSizeMb) * 1024 * 1024
}

/**
 * yt-dlp match-filter: reject live streams and media whose estimated WAV size
 * would exceed the guild downloads quota.
 */
function buildYtDlpMatchFilter(maxDirSizeMb: number): string {
    const maxDurationSec = Math.max(60, Math.floor((maxDirSizeMb / APPROX_WAV_MIB_PER_MINUTE) * 60))
    return `!is_live & duration <= ${maxDurationSec}`
}

/**
 * Creates a textual progress bar.
 * @param {number} progress The progress percentage.
 * @param {number} [length=20] The length of the progress bar.
 * @returns {string} The progress bar string.
 */
function createProgressBar(progress: number, length = 20) {
    const filled = Math.round((progress / 100) * length)
    const empty = length - filled
    return `\`[${"█".repeat(filled)}${"░".repeat(empty)}]\``
}

/**
 * Cleans up files in the downloads directory that are older than MAX_FILE_AGE_DAYS.
 * @param {string} downloadsDir The path to the downloads directory.
 * @param {import('../../lib/BotClient.js').default} client The bot client instance.
 * @param {string} guildId The guild ID used to scope cleanup.
 * @returns {{deletedCount: number, totalSize: number}} The number of deleted files and their total size.
 */
async function cleanupOldFiles(downloadsDir: string, client: BotClient, guildId: string) {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - MAX_FILE_AGE_DAYS)
    let deletedCount = 0
    let totalSize = 0
    let metadataDirty = false
    const deletedStoreKeys = new Set<string>()

    const metadata: DownloadsMetadataStore = getDownloadMetadataStore()

    const entries = Object.entries(metadata).filter(([key, info]) =>
        downloadMetadataEntryMatchesGuild(key, info, guildId)
    )

    for (const [storeKey, fileInfo] of entries) {
        const baseFileName = parseDownloadMetadataStoreKey(storeKey).fileName
        const filePath = path.join(downloadsDir, baseFileName)
        if (!isResolvedPathInsideDir(downloadsDir, filePath)) {
            client.error(
                `[Download Cleanup] Refusing path traversal for metadata file "${baseFileName}"`
            )
            continue
        }
        const metadataKeysForFile = downloadMetadataKeysForFile(metadata, baseFileName, guildId)
        let downloadDate = fileInfo?.downloadDate ? new Date(fileInfo.downloadDate) : null
        let stats = null
        if (!downloadDate || Number.isNaN(downloadDate.getTime())) {
            try {
                stats = fs.statSync(filePath)
                downloadDate = stats.mtime
            } catch (error: unknown) {
                const err = error as NodeJS.ErrnoException
                if (err.code === "ENOENT") {
                    for (const metaKey of metadataKeysForFile) {
                        delete metadata[metaKey]
                        deletedStoreKeys.add(metaKey)
                    }
                    metadataDirty = true
                    client.debug(
                        `[Download Cleanup] Removed ${metadataKeysForFile.length} metadata entr${metadataKeysForFile.length === 1 ? "y" : "ies"} for missing file "${baseFileName}" with no valid date.`
                    )
                    continue
                }
                client.error(
                    `[Download Cleanup] Failed to stat file "${baseFileName}" for date fallback:`,
                    error
                )
                continue
            }
        }
        if (downloadDate < cutoffDate) {
            try {
                if (!stats) {
                    try {
                        stats = fs.statSync(filePath)
                    } catch (error: unknown) {
                        const err = error as NodeJS.ErrnoException
                        if (err.code === "ENOENT") {
                            for (const metaKey of metadataKeysForFile) {
                                delete metadata[metaKey]
                                deletedStoreKeys.add(metaKey)
                            }
                            metadataDirty = true
                            client.debug(
                                `[Download Cleanup] Removed ${metadataKeysForFile.length} metadata entr${metadataKeysForFile.length === 1 ? "y" : "ies"} for missing file "${baseFileName}".`
                            )
                            continue
                        }
                        throw error
                    }
                }
                if (stats) {
                    totalSize += stats.size
                    fs.unlinkSync(filePath)
                    deletedCount++
                }
                for (const metaKey of metadataKeysForFile) {
                    delete metadata[metaKey]
                    deletedStoreKeys.add(metaKey)
                }
                metadataDirty = true
                client.debug(
                    `[Download Cleanup] Removed ${metadataKeysForFile.length} metadata entr${metadataKeysForFile.length === 1 ? "y" : "ies"} for "${baseFileName}" (downloaded ${downloadDate.toISOString()}) due to age${stats ? "" : " (metadata only)"}.`
                )
            } catch (error: unknown) {
                client.error(
                    `[Download Cleanup] Failed to delete old file "${baseFileName}":`,
                    error
                )
            }
        }
    }

    if (metadataDirty) {
        const ok = await saveDownloadMetadataStore(metadata, client, {
            deleteStoreKeys: [...deletedStoreKeys],
        })
        if (ok) {
            client.debug("[Download Cleanup] Updated metadata store after deleting old entries.")
        } else {
            client.error("[Download Cleanup] Error writing updated metadata store.")
        }
    }

    // Failed/timed-out yt-dlp runs leave guild-prefixed files with no metadata; reclaim aged ones.
    const trackedNames = new Set(
        Object.entries(metadata)
            .filter(([key, info]) => downloadMetadataEntryMatchesGuild(key, info, guildId))
            .map(([key]) => parseDownloadMetadataStoreKey(key).fileName)
    )
    for (const orphan of listAgedUntrackedGuildDownloadFiles(
        downloadsDir,
        guildId,
        trackedNames,
        UNTRACKED_DOWNLOAD_ORPHAN_AGE_MS
    )) {
        try {
            totalSize += orphan.size
            fs.unlinkSync(orphan.path)
            deletedCount++
            client.debug(
                `[Download Cleanup] Removed untracked orphan "${orphan.name}" (${orphan.size} bytes).`
            )
        } catch (error: unknown) {
            client.error(`[Download Cleanup] Failed to delete orphan "${orphan.name}":`, error)
        }
    }

    return { deletedCount, totalSize }
}

/**
 * Checks the total size of the downloads directory and cleans up the oldest files if it exceeds MAX_DIR_SIZE_MB.
 * @param {string} downloadsDir The path to the downloads directory.
 * @param {import('../../lib/BotClient.js').default} client The bot client instance.
 * @param {string} guildId The guild ID used to scope cleanup.
 * @param {number} maxDirSizeMb The max directory size in MB.
 * @param {string|null} [protectedFileName=null] Filename to skip during cleanup.
 * @returns {{deletedCount: number, deletedSize: number}} The number of deleted files and their total size.
 */
type SizedFile = { name: string; path: string; date: Date; size: number }

function getErrorCode(e: unknown): string | undefined {
    if (e && typeof e === "object" && "code" in e) {
        return (e as NodeJS.ErrnoException).code
    }
    return undefined
}

async function enforceDirectoryLimit(
    downloadsDir: string,
    client: BotClient,
    guildId: string,
    maxDirSizeMb: number,
    protectedFileName: string | null = null
) {
    const metadata: DownloadsMetadataStore = getDownloadMetadataStore()

    const seenFiles = new Map<string, SizedFile>()
    for (const [key, info] of Object.entries(metadata)) {
        if (!downloadMetadataEntryMatchesGuild(key, info, guildId)) continue
        const name = parseDownloadMetadataStoreKey(key).fileName
        if (seenFiles.has(name)) {
            const existing = seenFiles.get(name)!
            const candidateDate = info?.downloadDate ? new Date(info.downloadDate) : existing.date
            if (candidateDate.getTime() > existing.date.getTime()) {
                existing.date = candidateDate
            }
            continue
        }
        const filePath = path.join(downloadsDir, name)
        if (!isResolvedPathInsideDir(downloadsDir, filePath)) {
            client.error(`[download] refusing path traversal for metadata file`, { name })
            continue
        }
        let stats: fs.Stats
        try {
            stats = fs.statSync(filePath)
        } catch (e: unknown) {
            const code = getErrorCode(e)
            if (code === "ENOENT") {
                continue
            }
            client.error("[download] statSync failed", { filePath, e })
            continue
        }
        let date = info?.downloadDate ? new Date(info.downloadDate) : stats.mtime
        if (Number.isNaN(date.getTime())) {
            date = stats.mtime
        }
        seenFiles.set(name, { name, path: filePath, date, size: stats.size })
    }

    // Include aged untracked guild-prefixed files so failed downloads cannot bypass the quota.
    for (const orphan of listAgedUntrackedGuildDownloadFiles(
        downloadsDir,
        guildId,
        new Set(seenFiles.keys()),
        UNTRACKED_DOWNLOAD_ORPHAN_AGE_MS
    )) {
        seenFiles.set(orphan.name, {
            name: orphan.name,
            path: orphan.path,
            date: new Date(orphan.mtimeMs),
            size: orphan.size,
        })
    }

    const files: SizedFile[] = [...seenFiles.values()]

    const totalSize = files.reduce((size, file) => size + file.size, 0)
    const totalSizeMB = totalSize / (1024 * 1024)

    // If directory is too large, delete oldest files until under limit
    if (totalSizeMB > maxDirSizeMb) {
        const candidates = files
            .filter((file) => file.name !== protectedFileName)
            .sort((a, b) => a.date.getTime() - b.date.getTime())

        let deletedCount = 0
        let deletedSize = 0
        let metadataDirty = false
        const deletedStoreKeys = new Set<string>()
        let remainingBytes = totalSize

        for (const file of candidates) {
            if (remainingBytes / (1024 * 1024) <= maxDirSizeMb) {
                break
            }
            try {
                fs.unlinkSync(file.path)
                deletedCount++
                deletedSize += file.size
                remainingBytes -= file.size
                for (const metaKey of downloadMetadataKeysForFile(metadata, file.name, guildId)) {
                    delete metadata[metaKey]
                    deletedStoreKeys.add(metaKey)
                    metadataDirty = true
                }
            } catch (error: unknown) {
                client.error(`Failed to delete ${file.name}:`, error)
            }
        }

        if (metadataDirty) {
            const ok = await saveDownloadMetadataStore(metadata, client, {
                deleteStoreKeys: [...deletedStoreKeys],
            })
            if (ok) {
                client.debug("[Download Cleanup] Updated metadata after size cleanup.")
            } else {
                client.error("[Download Cleanup] Error writing metadata after size cleanup.")
            }
        }

        return { deletedCount, deletedSize }
    }

    return { deletedCount: 0, deletedSize: 0 }
}

const data = new SlashCommandBuilder()
    .setName("download")
    .setDescription("Download a YouTube video and play it or add to the queue.")
    .addStringOption((option) =>
        option.setName("url").setDescription("The YouTube URL to download").setRequired(true)
    )

/**
 * Executes the /download command to download a YouTube video and play it.
 * @param {import('discord.js').CommandInteraction} interaction The interaction that triggered the command.
 * @param {import('../../lib/BotClient.js').default} client The bot client instance.
 */
async function execute(interaction: ChatInputCommandInteraction, client: BotClient) {
    const guild = interaction.guild
    if (!guild) {
        return interaction.reply({
            content: "Use this command in a server.",
        })
    }
    const guildId = guild.id
    const member = guildMemberFromInteraction(interaction)
    if (!member) {
        return interaction.reply({
            content: "Could not resolve your member profile. Try again.",
        })
    }
    const voiceChannel = member.voice.channel
    if (!voiceChannel) {
        return interaction.reply({
            content: "You need to be in a voice channel to use this command.",
        })
    }

    const url = interaction.options.getString("url", true)

    // Validate URL
    let isValidHost = false
    try {
        const hostname = new URL(url).hostname
        isValidHost =
            hostname === "youtu.be" ||
            hostname === "youtube.com" ||
            hostname?.endsWith(".youtube.com")
    } catch {
        // Invalid URL format
    }
    if (!isValidHost) {
        return interaction.reply({
            content: "Please provide a valid YouTube URL.",
        })
    }

    await interaction.deferReply()

    try {
        let lastReplyAt = 0
        const updateReply = async (content: string, force = false) => {
            const now = Date.now()
            if (!force && now - lastReplyAt < 1500) return
            lastReplyAt = now
            await interaction
                .editReply({ content })
                .catch((e: unknown) => client.error("Failed to edit reply for download status", e))
        }

        await updateReply("Starting download... Preparing workspace.", true)

        // Create downloads directory if it doesn't exist
        const downloadsDir = path.join(process.cwd(), "downloads")
        const downloadFilePrefix = guildDownloadFilePrefix(guildId)
        const downloadRunId = randomBytes(8).toString("hex")
        const downloadRunPrefix = `${downloadFilePrefix}${downloadRunId}_`
        const reclaimFailedRunArtifacts = (reason: string) => {
            const reclaimed = removeDownloadFilesWithPrefix(downloadsDir, downloadRunPrefix)
            if (reclaimed.deletedCount > 0) {
                client.debug(
                    `[Download] Reclaimed ${reclaimed.deletedCount} failed-run artifact(s) after ${reason} (${(reclaimed.deletedSize / (1024 * 1024)).toFixed(2)}MB).`
                )
            }
        }
        if (!fs.existsSync(downloadsDir)) {
            fs.mkdirSync(downloadsDir)
        }

        // Cleanup old files
        await updateReply("Cleaning old downloads...", true)
        const maxDirSizeMb = getMaxDirSizeMb(client, guildId)
        const { deletedCount: ageDeletedCount, totalSize: ageDeletedSize } = await cleanupOldFiles(
            downloadsDir,
            client,
            guildId
        )
        const { deletedCount: sizeLimitDeletedCount, deletedSize: sizeLimitDeletedSize } =
            await enforceDirectoryLimit(downloadsDir, client, guildId, maxDirSizeMb)

        if (ageDeletedCount > 0) {
            client.debug(
                `[Download] Cleaned up ${ageDeletedCount} files older than ${MAX_FILE_AGE_DAYS} days (Total size: ${(ageDeletedSize / (1024 * 1024)).toFixed(2)}MB).`
            )
        }
        if (sizeLimitDeletedCount > 0) {
            client.debug(
                `[Download] Cleaned up ${sizeLimitDeletedCount} files due to directory size limit > ${maxDirSizeMb}MB (Total size freed: ${(sizeLimitDeletedSize / (1024 * 1024)).toFixed(2)}MB).`
            )
        }

        let downloadedFilePath: string | null = null

        // Download the video
        await updateReply("Downloading audio... This can take a moment.", true)
        const maxDownloadBytes = getMaxDownloadBytes(maxDirSizeMb)
        const matchFilter = buildYtDlpMatchFilter(maxDirSizeMb)
        let downloadProcess: ReturnType<typeof spawn>
        try {
            downloadProcess = spawn("yt-dlp", [
                url,
                "-x",
                "--audio-format",
                "wav",
                "--audio-quality",
                "0",
                "--no-playlist",
                "--no-warnings",
                "--newline",
                "--print",
                "after_move:filepath",
                // Source media size cap (WAV output can still be larger; post-check below).
                "--max-filesize",
                `${maxDirSizeMb}M`,
                "--match-filter",
                matchFilter,
                "-o",
                `${downloadsDir}/${downloadRunPrefix}%(title)s.%(ext)s`,
            ])
        } catch (syncErr: unknown) {
            client.error("[Download] spawn(yt-dlp) failed synchronously:", syncErr)
            await updateReply(
                "Failed to start download process: yt-dlp not found or could not be executed."
            )
            return
        }

        if (!downloadProcess.pid) {
            client.error("[Download] yt-dlp spawn returned no PID")
            await updateReply(
                "Failed to start download process: yt-dlp not found or could not be executed."
            )
            return
        }

        let timedOut = false
        const killTimer = setTimeout(() => {
            timedOut = true
            client.error(
                `[Download] yt-dlp exceeded ${DOWNLOAD_PROCESS_TIMEOUT_MS}ms; killing process`
            )
            try {
                downloadProcess.kill("SIGKILL")
            } catch (killErr: unknown) {
                client.error("[Download] Failed to kill timed-out yt-dlp:", killErr)
            }
        }, DOWNLOAD_PROCESS_TIMEOUT_MS)
        downloadProcess.on("close", () => clearTimeout(killTimer))
        downloadProcess.on("error", () => clearTimeout(killTimer))

        downloadProcess.on("error", (err: Error) => {
            client.error("[Download] Failed to start yt-dlp", err)
            updateReply(
                "Failed to start download process: yt-dlp not found or could not be executed."
            ).catch((e: unknown) => client.error("Failed to notify user about download failure", e))
        })

        let lastProgress = 0
        let outputBuffer = ""

        const processStdoutLine = (line: string) => {
            client.debug(`[yt-dlp stdout] ${line}`)
            if (line.startsWith(downloadsDir) && line.endsWith(".wav")) {
                downloadedFilePath = line.trim()
                client.debug(`[Download] Captured downloaded file path: ${downloadedFilePath}`)
                return
            }

            const progressMatch = line.match(
                /\[download]\s+(\d+(?:\.\d+)?)% of (\d+(?:\.\d+)?)([KMG]iB) at (\d+(?:\.\d+)?)([KMG]iB\/s) ETA (\d+:\d+)/
            )
            if (progressMatch) {
                const progress = parseFloat(progressMatch[1])
                const totalSize = parseFloat(progressMatch[2])
                const sizeUnit = progressMatch[3]
                const speed = parseFloat(progressMatch[4])
                const speedUnit = progressMatch[5]
                const eta = progressMatch[6]

                if (progress >= lastProgress + 1) {
                    lastProgress = progress
                    const progressBar = createProgressBar(progress)
                    const statusText =
                        `Downloading... ${progress.toFixed(1)}%\n` +
                        `${progressBar}\n` +
                        `Size: ${totalSize}${sizeUnit}\n` +
                        `Speed: ${speed}${speedUnit}\n` +
                        `ETA: ${eta}`

                    updateReply(statusText).catch((e: unknown) =>
                        client.error("Failed to edit reply for progress", e)
                    )
                }
            }
        }

        downloadProcess.stdout?.on("data", (data: Buffer) => {
            outputBuffer += data.toString()
            const lines = outputBuffer.split("\n")
            outputBuffer = lines.pop() ?? ""

            lines.forEach((line: string) => processStdoutLine(line))
        })

        downloadProcess.stderr?.on("data", (data: Buffer) => {
            client.error(`[Download] yt-dlp stderr: ${data}`)
        })

        downloadProcess.on("close", async (code: number | null) => {
            try {
                if (timedOut) {
                    reclaimFailedRunArtifacts("timeout")
                    await interaction
                        .editReply({
                            content:
                                "Download timed out. Try a shorter video, or contact an admin if this keeps happening.",
                        })
                        .catch((e: unknown) =>
                            client.error("Failed to edit reply on download timeout", e)
                        )
                    return
                }
                if (code !== 0) {
                    client.error(`[Download] yt-dlp process exited with code ${code}`)
                    reclaimFailedRunArtifacts(`exit code ${code}`)
                    await interaction
                        .editReply({
                            content:
                                "Error downloading video. It may be too long, live, or otherwise rejected by size limits. Try a shorter YouTube URL.",
                        })
                        .catch((e: unknown) =>
                            client.error("Failed to edit reply on download error", e)
                        )
                    return
                }

                const tail = outputBuffer.trim()
                outputBuffer = ""
                if (tail) {
                    for (const line of tail.split("\n")) {
                        if (line.trim()) processStdoutLine(line.trim())
                    }
                }

                await updateReply("Download complete. Finalizing file...", true)

                let filePath: string | null = downloadedFilePath
                let downloadedFile: string | null = filePath ? path.basename(filePath) : null

                if (!filePath) {
                    client.debug(
                        `[Download] File path not captured from yt-dlp output. Attempting to find most recent .wav file.`
                    )
                    const files = fs.readdirSync(downloadsDir)
                    client.debug(
                        `[Download] Searching for downloaded file in directory: ${downloadsDir}`
                    )
                    client.debug(`[Download] Available files: ${files.join(", ")}`)

                    const wavFiles = files
                        .filter(
                            (file) => file.startsWith(downloadRunPrefix) && file.endsWith(".wav")
                        )
                        .map((file) => ({
                            name: file,
                            path: path.join(downloadsDir, file),
                            mtime: fs.statSync(path.join(downloadsDir, file)).mtime,
                        }))
                        .sort((a, b) => b.mtime.getTime() - a.mtime.getTime())

                    if (wavFiles.length > 0) {
                        downloadedFile = wavFiles[0].name
                        filePath = wavFiles[0].path
                        client.debug(
                            `[Download] Found most recent WAV: ${downloadedFile} at ${filePath}`
                        )
                    }
                }

                if (!filePath || !downloadedFile) {
                    client.error(`[Download] Could not determine downloaded file path.`)
                    reclaimFailedRunArtifacts("missing output path")
                    await interaction
                        .editReply(
                            "Could not find the downloaded file after the download process. Please check logs."
                        )
                        .catch((e: unknown) =>
                            client.error("Failed to edit reply on file not found", e)
                        )
                    return
                }

                if (
                    !downloadedFile.startsWith(downloadRunPrefix) ||
                    !isResolvedPathInsideDir(downloadsDir, filePath)
                ) {
                    client.error(
                        `[Download] Rejecting unexpected output path outside this run: ${downloadedFile}`
                    )
                    reclaimFailedRunArtifacts("unexpected output path")
                    await interaction
                        .editReply({
                            content:
                                "Download finished but the output file could not be verified. Please try again.",
                        })
                        .catch((e: unknown) =>
                            client.error("Failed to edit reply on unexpected download path", e)
                        )
                    return
                }

                // Refuse to retain a single file larger than the guild quota. Previously the new
                // file was "protected" during size cleanup, so an oversized WAV wiped other guild
                // downloads while remaining on disk above the configured limit.
                let downloadedStats: fs.Stats
                try {
                    downloadedStats = fs.statSync(filePath)
                } catch (statErr: unknown) {
                    client.error("[Download] Failed to stat downloaded file:", statErr)
                    reclaimFailedRunArtifacts("stat failure")
                    await interaction
                        .editReply({
                            content:
                                "Download finished but the file could not be verified. Please try again.",
                        })
                        .catch((e: unknown) =>
                            client.error("Failed to edit reply on download stat failure", e)
                        )
                    return
                }
                if (downloadedStats.size > maxDownloadBytes) {
                    client.error(
                        `[Download] Rejecting oversized file ${downloadedFile} (${downloadedStats.size} bytes > ${maxDownloadBytes} byte guild limit)`
                    )
                    reclaimFailedRunArtifacts("oversized output")
                    await interaction
                        .editReply({
                            content: `Download rejected: the resulting file exceeds this server's download limit (${maxDirSizeMb}MB). Try a shorter video.`,
                        })
                        .catch((e: unknown) =>
                            client.error("Failed to edit reply on oversized download", e)
                        )
                    return
                }

                await updateReply(
                    `Saved as **${downloadedFile.replace(".wav", "")}**. Updating library...`,
                    true
                )

                const metadata: DownloadsMetadataStore = getDownloadMetadataStore()

                const metadataKey = downloadMetadataStoreKey(guildId, downloadedFile)
                metadata[metadataKey] = {
                    downloadDate: new Date().toISOString(),
                    originalUrl: url,
                    filePath: filePath,
                    guildId: guildId,
                }

                const metadataSaved = await saveDownloadMetadataStore(metadata, client, {
                    touchedStoreKeys: [metadataKey],
                })
                if (metadataSaved) {
                    client.debug(`[Download] Updated metadata for ${downloadedFile}`)
                } else {
                    client.error(`[Download] Error writing metadata store.`)
                }

                client.debug(`[Download] Successfully downloaded: ${filePath}`)

                const postCleanup = await enforceDirectoryLimit(
                    downloadsDir,
                    client,
                    guildId,
                    maxDirSizeMb,
                    downloadedFile
                )
                if (postCleanup.deletedCount > 0) {
                    client.debug(
                        `[Download] Post-download cleanup removed ${postCleanup.deletedCount} files (${(postCleanup.deletedSize / (1024 * 1024)).toFixed(2)}MB) to honor ${maxDirSizeMb}MB limit.`
                    )
                }

                const savedBaseName = downloadedFile.replace(/\.wav$/i, "")

                // Auto-play only from the bot's current voice channel. Otherwise Play Local /
                // ensurePlayerConnected would destroy the active session and move the bot.
                const existingPlayer = client.lavalink.getPlayer(guildId)
                const occupiedVoiceChannelId = resolveOccupiedVoiceChannelId(guild, existingPlayer)
                if (!memberMayJoinOccupiedVoice(occupiedVoiceChannelId, voiceChannel.id)) {
                    await interaction.editReply({
                        content:
                            `Saved as **${savedBaseName}**.\n` +
                            `You need to be in the same voice channel as the bot to auto-play.\n` +
                            `Use \`/play ${savedBaseName}\` from that channel when ready.`,
                    })
                    return
                }

                // Auto-play logic using handleQueryAndPlay
                try {
                    await updateReply("Attempting to play the downloaded track...", true)
                    const textChannel = interaction.channel
                    if (!textChannel?.isTextBased() || textChannel.isDMBased()) {
                        await interaction.editReply({
                            content:
                                "Download finished but this channel cannot be used for playback feedback.",
                        })
                        return
                    }
                    const playResult = await withGuildPlayerLifecycleReservation(
                        guildId,
                        async () => {
                            let player = client.lavalink.getPlayer(guildId)
                            if (!player) {
                                player = client.lavalink.createPlayer({
                                    guildId,
                                    voiceChannelId: voiceChannel.id,
                                    textChannelId: textChannel.id,
                                    selfDeaf: true,
                                })
                            }
                            if (!player) {
                                return null
                            }

                            return handleQueryAndPlay(
                                client,
                                guildId,
                                voiceChannel,
                                textChannel,
                                filePath,
                                interaction.user,
                                player
                            )
                        }
                    )
                    if (!playResult) {
                        await interaction.editReply({
                            content: "Could not start the music player.",
                        })
                        return
                    }

                    await interaction
                        .editReply({
                            content:
                                playResult.feedbackText ||
                                "Download complete. Playback status updated.",
                        })
                        .catch((e: unknown) =>
                            client.error(
                                "Failed to send final download & play confirmation via HQP",
                                e
                            )
                        )
                } catch (playError: unknown) {
                    client.error("[Download] Error during auto-play setup or HQP call:", playError)
                    const baseName = (downloadedFile ?? "").replace(".wav", "")
                    await interaction
                        .editReply({
                            content:
                                `Downloaded: **${baseName}**\n` +
                                `Could not automatically play the song: An error occurred while processing your request.\n` +
                                `Use \`/play ${baseName}\` to play it.`,
                        })
                        .catch((e: unknown) =>
                            client.error(
                                "Failed to send download confirmation with autoplay error",
                                e
                            )
                        )
                }
            } catch (error: unknown) {
                client.error("[Download] Unexpected error in close handler", error)
                reclaimFailedRunArtifacts("close handler error")
                await updateReply(
                    "An unexpected error occurred while finalizing the download. Please try again later.",
                    true
                ).catch((e: unknown) =>
                    client.error("Failed to edit reply on close handler error", e)
                )
            }
        })
    } catch (error: unknown) {
        client.error(`[Download] Error downloading video:`, error)
        const userMsg = "Failed to download video. Please try again or contact support."
        if (interaction.replied || interaction.deferred) {
            await interaction
                .editReply({
                    content: userMsg,
                })
                .catch((e: unknown) => client.error("Failed to edit reply on main catch block", e))
        } else {
            await interaction
                .reply({
                    content: userMsg,
                })
                .catch((e: unknown) => client.error("Failed to reply on main catch block", e))
        }
    }
}

export default { data, execute }
