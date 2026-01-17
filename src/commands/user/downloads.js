import { SlashCommandBuilder } from "discord.js"
import fs from "fs"
import path from "path"
import { formatDistanceToNow } from "date-fns"
import { getGuildSettings } from "../../util/saveControlChannel.js"

const DEFAULT_MAX_DIR_SIZE_MB = 1000

function getMaxDirSizeMb(guildId) {
    const settings = getGuildSettings()
    const guildSettings = settings[guildId] || {}
    const configured = guildSettings.downloadsMaxMb
    const parsed = Number.parseFloat(configured)
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
async function execute(interaction, client) {
    const downloadsDir = path.join(process.cwd(), "downloads")
    const guildId = interaction.guildId

    // Ensure downloads directory exists
    if (!fs.existsSync(downloadsDir)) {
        client.debug(`[Downloads] Downloads directory not found at ${downloadsDir}`)
        return interaction.reply({
            content: "No downloads directory found.",
        })
    }

    // Load metadata
    const metadataPath = path.join(downloadsDir, ".metadata.json")
    let metadata = {}
    if (fs.existsSync(metadataPath)) {
        try {
            metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"))
        } catch (error) {
            client.error(`[Downloads] Error reading metadata file:`, error)
        }
    }

    const subcommand = interaction.options.getSubcommand()
    client.debug(`[Downloads] Executing ${subcommand} subcommand`)

    if (subcommand === "list") {
        const files = Object.entries(metadata)
            .filter(([, info]) => info && info.guildId === guildId)
            .map(([file, info]) => {
                const filePath = path.join(downloadsDir, file)
                if (!fs.existsSync(filePath)) return null
                const stats = fs.statSync(filePath)
                return {
                    name: file.replace(".wav", ""),
                    size: stats.size,
                    date: info.downloadDate ? new Date(info.downloadDate) : stats.mtime,
                    originalUrl: info.originalUrl,
                    path: filePath,
                }
            })
            .filter(Boolean)
            .sort((a, b) => b.date - a.date)

        if (files.length === 0) {
            return interaction.reply("No downloaded files found for this server.")
        }

        // Calculate total size and limit
        const totalSize = files.reduce((sum, file) => sum + file.size, 0)
        const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(2)
        const limitMb = getMaxDirSizeMb(guildId)

        const fileList = files
            .map((file, index) => {
                const sizeMB = (file.size / (1024 * 1024)).toFixed(2)
                const age = formatDistanceToNow(file.date, { addSuffix: true })
                const urlInfo = file.originalUrl ? `\n   Source: ${file.originalUrl}` : ""
                return `${index + 1}. **${file.name}**\n   Size: ${sizeMB}MB | Downloaded: ${age}${urlInfo}`
            })
            .join("\n\n")

        return interaction.reply({
            content: `**Downloaded Files (${files.length})**\n` +
                `Storage: ${totalSizeMB}MB / ${limitMb}MB\n\n` +
                `${fileList}`,
        })
    }

    if (subcommand === "cleanup") {
        const removeAll = interaction.options.getBoolean("all") || false
        const days = interaction.options.getInteger("days") || 7
        const cutoffDate = new Date()
        cutoffDate.setDate(cutoffDate.getDate() - days)

        const files = Object.entries(metadata)
            .filter(([, info]) => info && info.guildId === guildId)
            .map(([file, info]) => {
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
            return interaction.reply(
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
                    totalSize += stats.size
                    fs.unlinkSync(file.path)
                    deletedCount++
                }
                // Remove from metadata
                if (metadata[file.name]) {
                    delete metadata[file.name]
                }
            } catch (error) {
                errors.push(`${file.name}: ${error.message}`)
            }
        }

        // Save updated metadata
        try {
            fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2))
        } catch (error) {
            client.error(`[Downloads] Error writing metadata file:`, error)
        }

        const sizeMB = (totalSize / (1024 * 1024)).toFixed(2)
        let response = removeAll
            ? `Removed ${deletedCount} files (${sizeMB}MB) for this server.`
            : `Cleaned up ${deletedCount} files (${sizeMB}MB) older than ${days} days.`

        if (errors.length > 0) {
            response += `\n\nFailed to delete ${errors.length} files:\n${errors.join("\n")}`
        }

        return interaction.reply({
            content: response,
        })
    }
}

export default { data, execute }
