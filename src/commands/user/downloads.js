import { SlashCommandBuilder } from "discord.js"
import fs from "fs"
import path from "path"
import { formatDistanceToNow } from "date-fns"

const data = new SlashCommandBuilder()
  .setName("downloads")
  .setDescription("Manage downloaded music files")
  .addSubcommand(subcommand =>
    subcommand
      .setName("list")
      .setDescription("List all downloaded files")
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName("cleanup")
      .setDescription("Remove old downloaded files")
      .addIntegerOption(option =>
        option
          .setName("days")
          .setDescription("Remove files older than this many days (default: 7)")
          .setRequired(false)
      )
  )

async function execute(interaction, client) {
  const downloadsDir = path.join(process.cwd(), "downloads")
  
  // Ensure downloads directory exists
  if (!fs.existsSync(downloadsDir)) {
    client.debug(`[Downloads] Downloads directory not found at ${downloadsDir}`)
    return interaction.reply({
      content: "❌ No downloads directory found.",
      ephemeral: true
    })
  }

  // Load metadata
  const metadataPath = path.join(downloadsDir, '.metadata.json')
  let metadata = {}
  if (fs.existsSync(metadataPath)) {
    try {
      metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'))
    } catch (error) {
      client.error(`[Downloads] Error reading metadata file:`, error)
    }
  }

  const subcommand = interaction.options.getSubcommand()
  client.debug(`[Downloads] Executing ${subcommand} subcommand`)

  if (subcommand === "list") {
    const files = fs.readdirSync(downloadsDir)
      .filter(file => file.endsWith(".wav"))
      .map(file => {
        const stats = fs.statSync(path.join(downloadsDir, file))
        const fileMetadata = metadata[file] || {}
        return {
          name: file.replace(".wav", ""),
          size: stats.size,
          date: fileMetadata.downloadDate ? new Date(fileMetadata.downloadDate) : stats.mtime,
          originalUrl: fileMetadata.originalUrl,
          path: path.join(downloadsDir, file)
        }
      })
      .sort((a, b) => b.date - a.date)

    if (files.length === 0) {
      return interaction.reply("No downloaded files found.")
    }

    // Calculate total size
    const totalSize = files.reduce((sum, file) => sum + file.size, 0)
    const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(2)

    const fileList = files.map((file, index) => {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(2)
      const age = formatDistanceToNow(file.date, { addSuffix: true })
      const urlInfo = file.originalUrl ? `\n   Source: ${file.originalUrl}` : ''
      return `${index + 1}. **${file.name}**\n   Size: ${sizeMB}MB | Downloaded: ${age}${urlInfo}`
    }).join("\n\n")

    return interaction.reply({
      content: `**Downloaded Files (${files.length}, Total: ${totalSizeMB}MB):**\n\n${fileList}`,
      ephemeral: true
    })
  }

  if (subcommand === "cleanup") {
    const days = interaction.options.getInteger("days") || 7
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - days)

    const files = fs.readdirSync(downloadsDir)
      .filter(file => file.endsWith(".wav"))
      .map(file => {
        const fileMetadata = metadata[file] || {}
        return {
          name: file,
          path: path.join(downloadsDir, file),
          date: fileMetadata.downloadDate ? new Date(fileMetadata.downloadDate) : fs.statSync(path.join(downloadsDir, file)).mtime
        }
      })
      .filter(file => file.date < cutoffDate)

    if (files.length === 0) {
      return interaction.reply(`No files older than ${days} days found.`)
    }

    let deletedCount = 0
    let totalSize = 0
    const errors = []

    for (const file of files) {
      try {
        const stats = fs.statSync(file.path)
        totalSize += stats.size
        fs.unlinkSync(file.path)
        // Remove from metadata
        if (metadata[file.name]) {
          delete metadata[file.name]
        }
        deletedCount++
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
    let response = `✅ Cleaned up ${deletedCount} files (${sizeMB}MB) older than ${days} days.`
    
    if (errors.length > 0) {
      response += `\n\n❌ Failed to delete ${errors.length} files:\n${errors.join("\n")}`
    }

    return interaction.reply({
      content: response,
      ephemeral: true
    })
  }
}

export default { data, execute } 