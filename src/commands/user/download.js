import { SlashCommandBuilder } from "discord.js"
import { spawn } from "child_process"
import path from "path"
import fs from "fs"
import { handleQueryAndPlay } from "../../util/musicManager.js"
import { getGuildSettings } from "../../util/saveControlChannel.js"

// Maximum age of files in days before automatic cleanup
const MAX_FILE_AGE_DAYS = 7

// Maximum total size of downloads directory in MB (default fallback)
const DEFAULT_MAX_DIR_SIZE_MB = 1000

/**
 * Resolves the configured downloads size limit for a guild.
 * @param {string} guildId The guild ID to read settings for.
 * @returns {number} The max directory size in MB.
 */
function getMaxDirSizeMb(guildId) {
  const settings = getGuildSettings()
  const guildSettings = settings[guildId] || {}
  const configured = guildSettings.downloadsMaxMb
  const parsed = Number.parseFloat(configured)
  return Number.isNaN(parsed) ? DEFAULT_MAX_DIR_SIZE_MB : parsed
}

/**
 * Creates a textual progress bar.
 * @param {number} progress The progress percentage.
 * @param {number} [length=20] The length of the progress bar.
 * @returns {string} The progress bar string.
 */
function createProgressBar(progress, length = 20) {
    const filled = Math.round((progress / 100) * length)
    const empty = length - filled
    return `\`[${'█'.repeat(filled)}${'░'.repeat(empty)}]\``
}

/**
 * Cleans up files in the downloads directory that are older than MAX_FILE_AGE_DAYS.
 * @param {string} downloadsDir The path to the downloads directory.
 * @param {import('../../lib/BotClient.js').default} client The bot client instance.
 * @param {string} guildId The guild ID used to scope cleanup.
 * @returns {{deletedCount: number, totalSize: number}} The number of deleted files and their total size.
 */
function cleanupOldFiles(downloadsDir, client, guildId) {
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - MAX_FILE_AGE_DAYS)
  let deletedCount = 0
  let totalSize = 0
  let metadataDirty = false

  const metadataPath = path.join(downloadsDir, '.metadata.json')
  let metadata = {}
  if (fs.existsSync(metadataPath)) {
    try {
      metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'))
    } catch (error) {
      client.error(`[Download Cleanup] Error reading metadata file for cleanup:`, error)
      return { deletedCount, totalSize } // Can't proceed reliably
    }
  }

  const entries = Object.entries(metadata).filter(
    ([, info]) => info && info.guildId === guildId
  )

  for (const [fileName, fileInfo] of entries) {
    const filePath = path.join(downloadsDir, fileName)
    const downloadDate = fileInfo?.downloadDate ? new Date(fileInfo.downloadDate) : null
    if (!downloadDate || Number.isNaN(downloadDate.getTime())) continue
    if (downloadDate < cutoffDate) {
      try {
        const stats = fs.existsSync(filePath) ? fs.statSync(filePath) : null
        if (stats) {
          totalSize += stats.size
          fs.unlinkSync(filePath)
          deletedCount++
          metadataDirty = true
        }
        delete metadata[fileName]
        metadataDirty = true
        client.debug(
          `[Download Cleanup] Deleted "${fileName}" (downloaded ${downloadDate.toISOString()}) due to age.`
        )
      } catch (error) {
        client.error(`[Download Cleanup] Failed to delete old file "${fileName}":`, error)
      }
    }
  }
  
  // Update metadata if changes were made
  if (metadataDirty) {
      try {
        fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2))
        client.debug("[Download Cleanup] Updated metadata file after deleting old entries.")
      } catch (error) {
        client.error("[Download Cleanup] Error writing updated metadata file:", error)
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
function enforceDirectoryLimit(downloadsDir, client, guildId, maxDirSizeMb, protectedFileName = null) {
  const metadataPath = path.join(downloadsDir, '.metadata.json')
  let metadata = {}
  if (fs.existsSync(metadataPath)) {
    try {
      metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'))
    } catch (error) {
      client.error(`[Download Cleanup] Error reading metadata file for size cleanup:`, error)
      return { deletedCount: 0, deletedSize: 0 }
    }
  }

  const files = Object.entries(metadata)
    .filter(([, info]) => info && info.guildId === guildId)
    .map(([name, info]) => {
      const filePath = path.join(downloadsDir, name)
      if (!fs.existsSync(filePath)) return null
      const stats = fs.statSync(filePath)
      const date = info?.downloadDate ? new Date(info.downloadDate) : stats.mtime
      return {
        name,
        path: filePath,
        date,
        size: stats.size,
      }
    })
    .filter(Boolean)

  const totalSize = files.reduce((size, file) => size + file.size, 0)
  const totalSizeMB = totalSize / (1024 * 1024)

  // If directory is too large, delete oldest files until under limit
  if (totalSizeMB > maxDirSizeMb) {
    const candidates = files
      .filter((file) => file.name !== protectedFileName)
      .sort((a, b) => a.date - b.date)

    let deletedCount = 0
    let deletedSize = 0
    let metadataDirty = false

    for (const file of candidates) {
      if ((totalSizeMB - (deletedSize / (1024 * 1024))) <= maxDirSizeMb) {
        break
      }
      try {
        fs.unlinkSync(file.path)
        deletedCount++
        deletedSize += file.size
        if (metadata[file.name]) {
          delete metadata[file.name]
          metadataDirty = true
        }
      } catch (error) {
        client.error(`Failed to delete ${file.name}:`, error)
      }
    }

    if (metadataDirty) {
      try {
        fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2))
        client.debug("[Download Cleanup] Updated metadata after size cleanup.")
      } catch (error) {
        client.error("[Download Cleanup] Error writing metadata file after size cleanup:", error)
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
    option
      .setName("url")
      .setDescription("The YouTube URL to download")
      .setRequired(true)
  )

/**
 * Executes the /download command to download a YouTube video and play it.
 * @param {import('discord.js').CommandInteraction} interaction The interaction that triggered the command.
 * @param {import('../../lib/BotClient.js').default} client The bot client instance.
 */
async function execute(interaction, client) {
  const url = interaction.options.getString("url")
  const member = interaction.member
  const guildId = interaction.guildId

  if (!member.voice.channel) {
    return interaction.reply({
      content: "You need to be in a voice channel to use this command.",
    })
  }
  
  // Validate URL
  if (!url.includes("youtube.com") && !url.includes("youtu.be")) {
    return interaction.reply({
      content: "Please provide a valid YouTube URL.",
    })
  }

  await interaction.deferReply()

  try {
    let lastReplyAt = 0
    const updateReply = async (content, force = false) => {
      const now = Date.now()
      if (!force && now - lastReplyAt < 1500) return
      lastReplyAt = now
      await interaction.editReply(content).catch((e) =>
        client.error("Failed to edit reply for download status", e)
      )
    }

    await updateReply("Starting download... Preparing workspace.", true)

    // Create downloads directory if it doesn't exist
    const downloadsDir = path.join(process.cwd(), "downloads")
    if (!fs.existsSync(downloadsDir)) {
      fs.mkdirSync(downloadsDir)
    }

    // Cleanup old files
    await updateReply("Cleaning old downloads...", true)
    const maxDirSizeMb = getMaxDirSizeMb(guildId)
    const { deletedCount: ageDeletedCount, totalSize: ageDeletedSize } = cleanupOldFiles(
      downloadsDir,
      client,
      guildId
    )
    const { deletedCount: sizeLimitDeletedCount, deletedSize: sizeLimitDeletedSize } =
      enforceDirectoryLimit(downloadsDir, client, guildId, maxDirSizeMb)

    if (ageDeletedCount > 0) {
      client.debug(`[Download] Cleaned up ${ageDeletedCount} files older than ${MAX_FILE_AGE_DAYS} days (Total size: ${(ageDeletedSize / (1024*1024)).toFixed(2)}MB).`)
    }
    if (sizeLimitDeletedCount > 0) {
      client.debug(`[Download] Cleaned up ${sizeLimitDeletedCount} files due to directory size limit > ${maxDirSizeMb}MB (Total size freed: ${(sizeLimitDeletedSize / (1024*1024)).toFixed(2)}MB).`)
    }
    
    let downloadedFilePath = null

    // Download the video
    await updateReply("Downloading audio... This can take a moment.", true)
    const downloadProcess = spawn('yt-dlp', [
        url,
        '-x',
        '--audio-format', 'wav',
        '--audio-quality', '0',
        '--no-playlist',
        '--no-warnings',
        '--newline',
        '--print', 'after_move:filepath',
        '-o', `${downloadsDir}/%(title)s.%(ext)s`
    ])

    let progressMessage = null
    let lastProgress = 0
    let outputBuffer = ""

    downloadProcess.stdout.on('data', (data) => {
        outputBuffer += data.toString()
        const lines = outputBuffer.split('\n')
        outputBuffer = lines.pop()

        lines.forEach(line => {
            client.debug(`[yt-dlp stdout] ${line}`)
            if (line.startsWith(downloadsDir) && line.endsWith(".wav")) {
                downloadedFilePath = line.trim()
                client.debug(`[Download] Captured downloaded file path: ${downloadedFilePath}`)
                return
            }

            const progressMatch = line.match(/\[download]\s+(\d+\.\d+)% of (\d+\.\d+)([KMG]iB) at (\d+\.\d+)([KMG]iB\/s) ETA (\d+:\d+)/)
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
                    const statusText = `Downloading... ${progress.toFixed(1)}%\n` +
                        `${progressBar}\n` +
                        `Size: ${totalSize}${sizeUnit}\n` +
                        `Speed: ${speed}${speedUnit}\n` +
                        `ETA: ${eta}`

                    if (!progressMessage) {
                        updateReply(statusText).then(msg => progressMessage = msg).catch(e => client.error("Failed to edit reply for progress", e))
                    } else {
                        updateReply(statusText).catch(e => client.error("Failed to edit reply for progress", e))
                    }
                }
            }
        })
    })

    downloadProcess.stderr.on('data', (data) => {
        client.error(`[Download] yt-dlp stderr: ${data}`)
    })

    downloadProcess.on('close', async (code) => {
        if (code !== 0) {
            client.error(`[Download] yt-dlp process exited with code ${code}`)
            await interaction.editReply('Error downloading video. Please try again later.').catch(e => client.error("Failed to edit reply on download error",e))
            return
        }

        await updateReply("Download complete. Finalizing file...", true)

        let filePath = downloadedFilePath
        let downloadedFile = filePath ? path.basename(filePath) : null

        if (!filePath) {
            client.debug(`[Download] File path not captured from yt-dlp output. Attempting to find most recent .wav file.`)
            const files = fs.readdirSync(downloadsDir)
            client.debug(`[Download] Searching for downloaded file in directory: ${downloadsDir}`)
            client.debug(`[Download] Available files: ${files.join(', ')}`)
            
            const wavFiles = files
                .filter(file => file.endsWith(".wav"))
                .map(file => ({
                    name: file,
                    path: path.join(downloadsDir, file),
                    mtime: fs.statSync(path.join(downloadsDir, file)).mtime
                }))
                .sort((a, b) => b.mtime - a.mtime)

            if (wavFiles.length > 0) {
                downloadedFile = wavFiles[0].name
                filePath = wavFiles[0].path
                client.debug(`[Download] Found most recent WAV: ${downloadedFile} at ${filePath}`)
            }
        }

        if (!filePath || !downloadedFile) {
            client.error(`[Download] Could not determine downloaded file path.`)
            await interaction.editReply('Could not find the downloaded file after the download process. Please check logs.').catch(e => client.error("Failed to edit reply on file not found",e))
            return
        }

        await updateReply(`Saved as **${downloadedFile.replace(".wav", "")}**. Updating library...`, true)

        const metadataPath = path.join(downloadsDir, '.metadata.json')
        let metadata = {}
        if (fs.existsSync(metadataPath)) {
            try {
                metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'))
            } catch (error) {
                client.error(`[Download] Error reading metadata file:`, error)
            }
        }
        
        metadata[downloadedFile] = {
            downloadDate: new Date().toISOString(),
            originalUrl: url,
            filePath: filePath,
            guildId: guildId
        }
        
        try {
            fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2))
            client.debug(`[Download] Updated metadata for ${downloadedFile}`)
        } catch (error) {
            client.error(`[Download] Error writing metadata file:`, error)
        }

        client.debug(`[Download] Successfully downloaded: ${filePath}`)

        const postCleanup = enforceDirectoryLimit(
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
            let player = client.lavalink.getPlayer(guildId)
            if (!player) {
                player = client.lavalink.createPlayer({
                    guildId: guildId,
                    voiceChannelId: member.voice.channel.id,
                    textChannelId: interaction.channel.id,
                    selfDeaf: true,
                })
            }
            // No need to manually connect here, handleQueryAndPlay should manage it.

            const playResult = await handleQueryAndPlay(
                client,
                guildId,
                member.voice.channel, // Pass the voice channel object
                interaction.channel,  // Pass the text channel object
                filePath,             // Use the file path as the query
                interaction.user,     // Pass the requester
                player                // Pass the player instance
            )

            // Edit the reply with the feedback from handleQueryAndPlay
            await interaction.editReply(playResult.feedbackText || "Download complete. Playback status updated.").catch(e => client.error("Failed to send final download & play confirmation via HQP", e))

        } catch (playError) {
            client.error("[Download] Error during auto-play setup or HQP call:", playError)
            await interaction.editReply(
                `Downloaded: **${downloadedFile.replace(".wav", "")}**\n` +
                `Could not automatically play the song: ${playError.message}\n`+
                `Use \`/play ${downloadedFile.replace(".wav", "")}\` to play it.`
            ).catch(e => client.error("Failed to send download confirmation with autoplay error", e))
        }

    })

  }
 catch (error) {
    client.error(`[Download] Error downloading video:`, error)
    if (interaction.replied || interaction.deferred) {
        await interaction.editReply({
            content: `Failed to download video: ${error.message}`,
        }).catch(e => client.error("Failed to edit reply on main catch block", e))
    } else {
        await interaction.reply({
            content: `Failed to download video: ${error.message}`,
        }).catch(e => client.error("Failed to reply on main catch block", e))
    }
  }
}

export default { data, execute }
