import { SlashCommandBuilder } from "discord.js"
import { spawn } from "child_process"
import path from "path"
import fs from "fs"
import { handleQueryAndPlay } from "../../util/musicManager.js"

// Maximum age of files in days before automatic cleanup
const MAX_FILE_AGE_DAYS = 7

// Maximum total size of downloads directory in MB
const MAX_DIR_SIZE_MB = 1000

/**
 * Creates a textual progress bar.
 * @param {number} progress The progress percentage.
 * @param {number} [length=20] The length of the progress bar.
 * @returns {string} The progress bar string.
 */
function createProgressBar(progress, length = 20) {
    const filled = Math.round((progress / 100) * length)
    const empty = length - filled
    return `[${"█".repeat(filled)}${"░".repeat(empty)}]`
}

/**
 * Cleans up files in the downloads directory that are older than MAX_FILE_AGE_DAYS.
 * @param {string} downloadsDir The path to the downloads directory.
 * @param {import('../../lib/BotClient.js').default} client The bot client instance.
 * @returns {{deletedCount: number, totalSize: number}} The number of deleted files and their total size.
 */
function cleanupOldFiles(downloadsDir, client) {
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - MAX_FILE_AGE_DAYS)
  let deletedCount = 0
  let totalSize = 0

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

  const filesInDir = fs.readdirSync(downloadsDir).filter(file => file.endsWith(".wav"))

  for (const fileName of filesInDir) {
    const fileInfo = metadata[fileName]
    const filePath = path.join(downloadsDir, fileName)

    if (fileInfo && fileInfo.downloadDate) {
      const downloadDate = new Date(fileInfo.downloadDate)
      if (downloadDate < cutoffDate) {
        try {
          const stats = fs.statSync(filePath)
          totalSize += stats.size
          fs.unlinkSync(filePath)
          deletedCount++
          client.debug(`[Download Cleanup] Deleted "${fileName}" (downloaded ${downloadDate.toISOString()}) due to age.`)
          // Remove from metadata as well
          delete metadata[fileName]
        } catch (error) {
          client.error(`[Download Cleanup] Failed to delete old file "${fileName}":`, error)
        }
      }
    } else if (fs.existsSync(filePath)) { // File exists but no metadata or downloadDate
      // Option: Fallback to mtime, or just log and potentially delete if orphaned
      // For now, let's assume files without proper metadata downloadDate might be stale or orphaned
      // and check their mtime as a fallback, or delete if very old / treat as error.
      // Let's be conservative and use mtime as a fallback for this case.
      try {
        const stats = fs.statSync(filePath)
        if (stats.mtime < cutoffDate) {
          totalSize += stats.size
          fs.unlinkSync(filePath)
          deletedCount++
          client.warn(`[Download Cleanup] Deleted "${fileName}" based on mtime (metadata missing/incomplete). mtime: ${stats.mtime.toISOString()}`)
          // If it was in metadata but lacked downloadDate, remove it.
          if (metadata[fileName]) delete metadata[fileName]
        } else {
          client.warn(`[Download Cleanup] File "${fileName}" missing downloadDate in metadata, but mtime is recent. Kept. mtime: ${stats.mtime.toISOString()}`)
        }
      } catch (error) {
        client.error(`[Download Cleanup] Error processing file "${fileName}" with missing metadata:`, error)
      }
    }
  }
  
  // Update metadata if changes were made
  if (deletedCount > 0) {
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
 * @returns {{deletedCount: number, deletedSize: number}} The number of deleted files and their total size.
 */
function checkAndCleanupDirectory(downloadsDir, client) {
  // Get total size of directory
  const totalSize = fs.readdirSync(downloadsDir)
    .filter(file => file.endsWith(".wav"))
    .reduce((size, file) => size + fs.statSync(path.join(downloadsDir, file)).size, 0)

  const totalSizeMB = totalSize / (1024 * 1024)

  // If directory is too large, delete oldest files until under limit
  if (totalSizeMB > MAX_DIR_SIZE_MB) {
    const files = fs.readdirSync(downloadsDir)
      .filter(file => file.endsWith(".wav"))
      .map(file => ({
        name: file,
        path: path.join(downloadsDir, file),
        date: fs.statSync(path.join(downloadsDir, file)).mtime,
        size: fs.statSync(path.join(downloadsDir, file)).size
      }))
      .sort((a, b) => a.date - b.date)

    let deletedCount = 0
    let deletedSize = 0

    for (const file of files) {
      if ((totalSizeMB - (deletedSize / (1024 * 1024))) <= MAX_DIR_SIZE_MB) {
        break
      }
      try {
        fs.unlinkSync(file.path)
        deletedCount++
        deletedSize += file.size
      } catch (error) {
        client.error(`Failed to delete ${file.name}:`, error)
      }
    }

    return { deletedCount, deletedSize }
  }

  return { deletedCount: 0, deletedSize: 0 }
}

const data = new SlashCommandBuilder()
  .setName("download")
  .setDescription("Download a YouTube video and play it or add to queue.")
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
      content: "❌ You need to be in a voice channel to use this command.",
      ephemeral: true
    })
  }
  
  // Validate URL
  if (!url.includes("youtube.com") && !url.includes("youtu.be")) {
    return interaction.reply({
      content: "❌ Please provide a valid YouTube URL.",
      ephemeral: true
    })
  }

  await interaction.deferReply()

  try {
    // Create downloads directory if it doesn't exist
    const downloadsDir = path.join(process.cwd(), "downloads")
    if (!fs.existsSync(downloadsDir)) {
      fs.mkdirSync(downloadsDir)
    }

    // Cleanup old files
    const { deletedCount: ageDeletedCount, totalSize: ageDeletedSize } = cleanupOldFiles(downloadsDir, client)
    const { deletedCount: sizeLimitDeletedCount, deletedSize: sizeLimitDeletedSize } = checkAndCleanupDirectory(downloadsDir, client)

    if (ageDeletedCount > 0) {
      client.debug(`[Download] Cleaned up ${ageDeletedCount} files older than ${MAX_FILE_AGE_DAYS} days (Total size: ${(ageDeletedSize / (1024*1024)).toFixed(2)}MB).`)
    }
    if (sizeLimitDeletedCount > 0) {
      client.debug(`[Download] Cleaned up ${sizeLimitDeletedCount} files due to directory size limit > ${MAX_DIR_SIZE_MB}MB (Total size freed: ${(sizeLimitDeletedSize / (1024*1024)).toFixed(2)}MB).`)
    }
    
    let downloadedFilePath = null

    // Download the video
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

            const progressMatch = line.match(/\[download\]\s+(\d+\.\d+)% of (\d+\.\d+)([KMG]iB) at (\d+\.\d+)([KMG]iB\/s) ETA (\d+:\d+)/)
            if (progressMatch) {
                const progress = parseFloat(progressMatch[1])
                const totalSize = parseFloat(progressMatch[2])
                const sizeUnit = progressMatch[3]
                const speed = parseFloat(progressMatch[4])
                const speedUnit = progressMatch[5]
                const eta = progressMatch[6]

                if (progress > lastProgress) {
                    lastProgress = progress
                    const progressBar = createProgressBar(progress)
                    const statusText = `Downloading... ${progress.toFixed(1)}%\n` +
                        `${progressBar}\n` +
                        `Size: ${totalSize}${sizeUnit}\n` +
                        `Speed: ${speed}${speedUnit}\n` +
                        `ETA: ${eta}`

                    if (!progressMessage) {
                        interaction.editReply(statusText).then(msg => progressMessage = msg).catch(e => client.error("Failed to edit reply for progress", e))
                    } else {
                        interaction.editReply(statusText).catch(e => client.error("Failed to edit reply for progress", e))
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
            await interaction.editReply('Could not find the downloaded file after download process. Please check logs.').catch(e => client.error("Failed to edit reply on file not found",e))
            return
        }

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
            filePath: filePath
        }
        
        try {
            fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2))
            client.debug(`[Download] Updated metadata for ${downloadedFile}`)
        } catch (error) {
            client.error(`[Download] Error writing metadata file:`, error)
        }

        client.debug(`[Download] Successfully downloaded: ${filePath}`)

        // Auto-play logic using handleQueryAndPlay
        try {
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
            await interaction.editReply(playResult.feedbackText || "✅ Download complete. Playback status updated.").catch(e => client.error("Failed to send final download & play confirmation via HQP", e))

        } catch (playError) {
            client.error("[Download] Error during auto-play setup or HQP call:", playError)
            await interaction.editReply(
                `✅ Downloaded: **${downloadedFile.replace(".wav", "")}**\n` +
                `⚠️ Could not automatically play the song: ${playError.message}\n`+
                `Use \`/play ${downloadedFile.replace(".wav", "")}\` to play it.`
            ).catch(e => client.error("Failed to send download confirmation with autoplay error", e))
        }

    })

  } catch (error) {
    client.error(`[Download] Error downloading video:`, error)
    if (interaction.replied || interaction.deferred) {
        await interaction.editReply({
            content: `❌ Failed to download video: ${error.message}`,
        }).catch(e => client.error("Failed to edit reply on main catch block", e))
    } else {
        await interaction.reply({
            content: `❌ Failed to download video: ${error.message}`,
            ephemeral: true
        }).catch(e => client.error("Failed to reply on main catch block", e))
    }
  }
}

export default { data, execute }
