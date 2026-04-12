import { SlashCommandBuilder } from "discord.js"
import type { ChatInputCommandInteraction } from "discord.js"
import { spawn } from "child_process"
import path from "path"
import fs from "fs"
import type BotClient from "../../lib/BotClient.js"
import { handleQueryAndPlay } from "../../util/musicManager.js"
import { getGuildSettings } from "../../util/saveControlChannel.js"
import { guildMemberFromInteraction } from "../../util/guildMember.js"
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

// Maximum age of files in days before automatic cleanup
const MAX_FILE_AGE_DAYS = 7

// Maximum total size of downloads directory in MB (default fallback)
const DEFAULT_MAX_DIR_SIZE_MB = 1000

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

    const metadata: DownloadsMetadataStore = getDownloadMetadataStore()

    const entries = Object.entries(metadata).filter(([key, info]) =>
        downloadMetadataEntryMatchesGuild(key, info, guildId)
    )

    for (const [storeKey, fileInfo] of entries) {
        const baseFileName = parseDownloadMetadataStoreKey(storeKey).fileName
        const filePath = path.join(downloadsDir, baseFileName)
        let downloadDate = fileInfo?.downloadDate ? new Date(fileInfo.downloadDate) : null
        let stats = null
        if (!downloadDate || Number.isNaN(downloadDate.getTime())) {
            try {
                stats = fs.statSync(filePath)
                downloadDate = stats.mtime
            } catch (error: unknown) {
                const err = error as NodeJS.ErrnoException
                if (err.code === "ENOENT") {
                    delete metadata[storeKey]
                    metadataDirty = true
                    client.debug(
                        `[Download Cleanup] Removed "${storeKey}" entry with missing file and no valid date.`
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
                            delete metadata[storeKey]
                            metadataDirty = true
                            client.debug(
                                `[Download Cleanup] Removed "${storeKey}" entry due to missing file.`
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
                delete metadata[storeKey]
                metadataDirty = true
                client.debug(
                    `[Download Cleanup] Removed "${storeKey}" entry (downloaded ${downloadDate.toISOString()}) due to age${stats ? "" : " (metadata only)"}.`
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
        const ok = await saveDownloadMetadataStore(metadata, client)
        if (ok) {
            client.debug("[Download Cleanup] Updated metadata store after deleting old entries.")
        } else {
            client.error("[Download Cleanup] Error writing updated metadata store.")
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
        let stats: fs.Stats
        try {
            stats = fs.statSync(filePath)
        } catch (e: unknown) {
            const code =
                e && typeof e === "object" && "code" in e
                    ? (e as NodeJS.ErrnoException).code
                    : undefined
            if (code === "ENOENT") {
                continue
            }
            console.error("[download] statSync failed", { filePath, e })
            continue
        }
        let date = info?.downloadDate ? new Date(info.downloadDate) : stats.mtime
        if (Number.isNaN(date.getTime())) {
            date = stats.mtime
        }
        seenFiles.set(name, { name, path: filePath, date, size: stats.size })
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

        for (const file of candidates) {
            if (totalSizeMB - deletedSize / (1024 * 1024) <= maxDirSizeMb) {
                break
            }
            try {
                fs.unlinkSync(file.path)
                deletedCount++
                deletedSize += file.size
                for (const metaKey of downloadMetadataKeysForFile(metadata, file.name, guildId)) {
                    delete metadata[metaKey]
                    metadataDirty = true
                }
            } catch (error: unknown) {
                client.error(`Failed to delete ${file.name}:`, error)
            }
        }

        if (metadataDirty) {
            const ok = await saveDownloadMetadataStore(metadata, client)
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
        const downloadFilePrefix = `${guildId}_`
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
                "-o",
                `${downloadsDir}/${downloadFilePrefix}%(title)s.%(ext)s`,
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
                if (code !== 0) {
                    client.error(`[Download] yt-dlp process exited with code ${code}`)
                    await interaction
                        .editReply({ content: "Error downloading video. Please try again later." })
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
                            (file) => file.startsWith(downloadFilePrefix) && file.endsWith(".wav")
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
                    await interaction
                        .editReply(
                            "Could not find the downloaded file after the download process. Please check logs."
                        )
                        .catch((e: unknown) =>
                            client.error("Failed to edit reply on file not found", e)
                        )
                    return
                }

                await updateReply(
                    `Saved as **${downloadedFile.replace(".wav", "")}**. Updating library...`,
                    true
                )

                const metadata: DownloadsMetadataStore = getDownloadMetadataStore()

                metadata[downloadMetadataStoreKey(guildId, downloadedFile)] = {
                    downloadDate: new Date().toISOString(),
                    originalUrl: url,
                    filePath: filePath,
                    guildId: guildId,
                }

                const metadataSaved = await saveDownloadMetadataStore(metadata, client)
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
                        await interaction.editReply({
                            content: "Could not start the music player.",
                        })
                        return
                    }

                    const playResult = await handleQueryAndPlay(
                        client,
                        guildId,
                        voiceChannel,
                        textChannel,
                        filePath,
                        interaction.user,
                        player
                    )

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
