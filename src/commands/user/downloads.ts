import { SlashCommandBuilder } from "discord.js"
import type { ChatInputCommandInteraction } from "discord.js"
import fs from "fs"
import { access as fsAccess, stat as fsStat } from "fs/promises"
import path from "path"
import { formatDistanceToNow } from "date-fns"
import type BotClient from "../../lib/BotClient.js"
import { getGuildSettings } from "../../util/saveControlChannel.js"
import type { DownloadsMetadataStore } from "../../types/index.js"
import {
    downloadMetadataEntryMatchesGuild,
    downloadMetadataKeysForFile,
    parseDownloadMetadataStoreKey,
} from "../../util/downloadMetadataKeys.js"
import {
    getDownloadMetadataStore,
    saveDownloadMetadataStore,
} from "../../util/downloadMetadataStore.js"

const DEFAULT_MAX_DIR_SIZE_MB = 1000

/** Selects the latest metadata entry per physical fileName for a guild. */
function dedupeMetadataByFileName(
    metadata: DownloadsMetadataStore,
    guildId: string
): Map<string, { key: string; info: DownloadsMetadataStore[string] }> {
    const result = new Map<string, { key: string; info: DownloadsMetadataStore[string] }>()
    for (const [key, info] of Object.entries(metadata)) {
        if (!downloadMetadataEntryMatchesGuild(key, info, guildId)) continue
        const fileName = parseDownloadMetadataStoreKey(key).fileName
        const existing = result.get(fileName)
        if (!existing) {
            result.set(fileName, { key, info })
            continue
        }
        const existingDate = existing.info.downloadDate
            ? new Date(existing.info.downloadDate).getTime()
            : 0
        const candidateDate = info.downloadDate ? new Date(info.downloadDate).getTime() : 0
        if (candidateDate >= existingDate) {
            result.set(fileName, { key, info })
        }
    }
    return result
}

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
    return Number.isNaN(parsed) ? DEFAULT_MAX_DIR_SIZE_MB : parsed
}

const data = new SlashCommandBuilder()
    .setName("downloads")
    .setDescription("Manage downloaded music files")
    .addSubcommand((subcommand) =>
        subcommand.setName("list").setDescription("List all downloaded files")
    )
    .addSubcommand((subcommand) =>
        subcommand
            .setName("cleanup")
            .setDescription("Remove old downloaded files")
            .addIntegerOption((option) =>
                option
                    .setName("days")
                    .setDescription("Remove files older than this many days (default: 7)")
                    .setRequired(false)
            )
            .addBooleanOption((option) =>
                option
                    .setName("all")
                    .setDescription("Remove all downloaded files for this server")
                    .setRequired(false)
            )
    )

/**
 * Executes the /downloads command to list or clean up downloaded files.
 * @param {import('discord.js').CommandInteraction} interaction The interaction that triggered the command.
 * @param {import('../../lib/BotClient.js').default} client The bot client instance.
 */
async function execute(interaction: ChatInputCommandInteraction, client: BotClient) {
    let subcommandContext = "unknown"
    const guildIdContext = interaction.guildId ?? "unknown"

    try {
        const downloadsDir = path.join(process.cwd(), "downloads")
        const guildId = interaction.guildId
        if (!guildId) {
            return interaction.reply({ content: "Use this command in a server.", ephemeral: true })
        }

        // Ensure downloads directory exists
        if (!fs.existsSync(downloadsDir)) {
            client.debug(`[Downloads] Downloads directory not found at ${downloadsDir}`)
            return interaction.reply({
                content: "No downloads directory found.",
                ephemeral: true,
            })
        }

        // Load metadata from the database-backed cache.
        const metadata: DownloadsMetadataStore = getDownloadMetadataStore()

        const subcommand = interaction.options.getSubcommand()
        subcommandContext = subcommand
        client.debug(`[Downloads] Executing ${subcommand} subcommand`)

        if (subcommand === "list") {
            await interaction.deferReply({ ephemeral: true })

            const dedupedEntries = dedupeMetadataByFileName(metadata, guildId)

            const fileRows = await Promise.all(
                [...dedupedEntries.values()].map(async ({ key, info }) => {
                    const file = parseDownloadMetadataStoreKey(key).fileName
                    const filePath = path.join(downloadsDir, file)
                    try {
                        await fsAccess(filePath)
                        const stats = await fsStat(filePath)
                        const row: {
                            name: string
                            size: number
                            date: Date
                            path: string
                            originalUrl?: string
                        } = {
                            name: file.replace(".wav", ""),
                            size: stats.size,
                            date: info.downloadDate ? new Date(info.downloadDate) : stats.mtime,
                            path: filePath,
                        }
                        if (info.originalUrl) row.originalUrl = info.originalUrl
                        return row
                    } catch {
                        return null
                    }
                })
            )
            const files = fileRows
                .filter((x): x is NonNullable<typeof x> => x != null)
                .sort((a, b) => b.date.getTime() - a.date.getTime())

            if (files.length === 0) {
                return interaction.editReply({
                    content: "No downloaded files found for this server.",
                })
            }

            // Calculate total size and limit
            const totalSize = files.reduce((sum, file) => sum + file.size, 0)
            const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(2)
            const limitMb = getMaxDirSizeMb(client, guildId)

            const fileList = files
                .map((file, index) => {
                    const sizeMB = (file.size / (1024 * 1024)).toFixed(2)
                    const age = formatDistanceToNow(file.date, { addSuffix: true })
                    const urlInfo = file.originalUrl ? `\n   Source: ${file.originalUrl}` : ""
                    return `${index + 1}. **${file.name}**\n   Size: ${sizeMB}MB | Downloaded: ${age}${urlInfo}`
                })
                .join("\n\n")

            const header =
                `**Downloaded Files (${files.length})**\n` +
                `Storage: ${totalSizeMB}MB / ${limitMb}MB\n\n`

            const maxContentLength = 2000
            const headerFits = header.length < maxContentLength
            if (headerFits && header.length + fileList.length <= maxContentLength) {
                return interaction.editReply({
                    content: header + fileList,
                })
            }

            const chunks = []
            let currentChunk = headerFits ? header : ""
            for (const entry of fileList.split("\n\n")) {
                const entryWithSpacing = currentChunk ? `\n\n${entry}` : entry
                if (currentChunk.length + entryWithSpacing.length > maxContentLength) {
                    if (currentChunk) {
                        chunks.push(currentChunk)
                    }
                    currentChunk = entry
                } else {
                    currentChunk += entryWithSpacing
                }
            }
            if (currentChunk) {
                chunks.push(currentChunk)
            }

            if (chunks.length === 0) {
                return interaction.editReply({
                    content: headerFits ? header : `**Downloaded Files (${files.length})**\n`,
                })
            }

            await interaction.editReply({ content: chunks[0] })
            for (const chunk of chunks.slice(1)) {
                await interaction.followUp({ content: chunk, ephemeral: true })
            }
            return
        }

        if (subcommand === "cleanup") {
            await interaction.deferReply()
            const removeAll = interaction.options.getBoolean("all") || false
            const days = interaction.options.getInteger("days") || 7
            const cutoffDate = new Date()
            cutoffDate.setDate(cutoffDate.getDate() - days)

            const dedupedEntries = dedupeMetadataByFileName(metadata, guildId)

            const files = [...dedupedEntries.values()]
                .map(({ key, info }) => {
                    const file = parseDownloadMetadataStoreKey(key).fileName
                    const filePath = path.join(downloadsDir, file)
                    const date = info.downloadDate
                        ? new Date(info.downloadDate)
                        : fs.existsSync(filePath)
                          ? fs.statSync(filePath).mtime
                          : null
                    return {
                        name: file,
                        path: filePath,
                        date,
                    }
                })
                .filter((file) => (removeAll ? true : file.date && file.date < cutoffDate))

            if (files.length === 0) {
                return interaction.editReply(
                    removeAll
                        ? "No downloaded files found for this server."
                        : `No files older than ${days} days found for this server.`
                )
            }

            let deletedCount = 0
            let totalSize = 0
            const errors = []

            for (const file of files) {
                try {
                    if (fs.existsSync(file.path)) {
                        const stats = fs.statSync(file.path)
                        fs.unlinkSync(file.path)
                        totalSize += stats.size
                        deletedCount++
                    }
                    for (const metaKey of downloadMetadataKeysForFile(
                        metadata,
                        file.name,
                        guildId
                    )) {
                        delete metadata[metaKey]
                    }
                } catch (error: unknown) {
                    const msg = error instanceof Error ? error.message : String(error)
                    errors.push(`${file.name}: ${msg}`)
                }
            }

            const metadataSaved = await saveDownloadMetadataStore(metadata, client)
            if (!metadataSaved) {
                client.error(
                    `[Downloads] Failed to persist metadata cleanup updates to database (guildId=${guildId}, subcommand=${subcommand}).`
                )
            }

            const sizeMB = (totalSize / (1024 * 1024)).toFixed(2)
            let response = removeAll
                ? `Removed ${deletedCount} files (${sizeMB}MB) for this server.`
                : `Cleaned up ${deletedCount} files (${sizeMB}MB) older than ${days} days.`

            if (!metadataSaved) {
                response +=
                    "\n\nWarning: metadata cleanup could not be persisted to the database. Stale rows may remain and cleanup may be incomplete."
            }

            if (errors.length > 0) {
                response += `\n\nFailed to delete ${errors.length} files:\n${errors.join("\n")}`
            }

            return interaction.editReply({
                content: response,
            })
        }
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        client.error(
            `[Downloads] /downloads command failed (guildId=${guildIdContext}, subcommand=${subcommandContext}): ${message}`
        )
        const response = "An unexpected error occurred while running /downloads."
        if (interaction.deferred || interaction.replied) {
            return interaction.editReply({ content: response })
        }
        return interaction.reply({ content: response })
    }
}

export default { data, execute }
