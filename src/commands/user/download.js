import { SlashCommandBuilder } from "discord.js"
import { spawn } from "child_process"
import path from "path"
import fs from "fs"

// Maximum age of files in days before automatic cleanup
const MAX_FILE_AGE_DAYS = 7

// Maximum total size of downloads directory in MB
const MAX_DIR_SIZE_MB = 1000

function createProgressBar(progress, length = 20) {
    const filled = Math.round((progress / 100) * length)
    const empty = length - filled
    return `[${'█'.repeat(filled)}${'░'.repeat(empty)}]`
}

function cleanupOldFiles(downloadsDir) {
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - MAX_FILE_AGE_DAYS)

  const files = fs.readdirSync(downloadsDir)
    .filter(file => file.endsWith(".mp3"))
    .map(file => ({
      name: file,
      path: path.join(downloadsDir, file),
      date: fs.statSync(path.join(downloadsDir, file)).mtime
    }))
    .filter(file => file.date < cutoffDate)

  let deletedCount = 0
  let totalSize = 0

  for (const file of files) {
    try {
      const stats = fs.statSync(file.path)
      totalSize += stats.size
      fs.unlinkSync(file.path)
      deletedCount++
    } catch (error) {
      console.error(`Failed to delete ${file.name}:`, error)
    }
  }

  return { deletedCount, totalSize }
}

function checkAndCleanupDirectory(downloadsDir) {
  // Get total size of directory
  const totalSize = fs.readdirSync(downloadsDir)
    .filter(file => file.endsWith(".mp3"))
    .reduce((size, file) => size + fs.statSync(path.join(downloadsDir, file)).size, 0)

  const totalSizeMB = totalSize / (1024 * 1024)

  // If directory is too large, delete oldest files until under limit
  if (totalSizeMB > MAX_DIR_SIZE_MB) {
    const files = fs.readdirSync(downloadsDir)
      .filter(file => file.endsWith(".mp3"))
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
        console.error(`Failed to delete ${file.name}:`, error)
      }
    }

    return { deletedCount, deletedSize }
  }

  return { deletedCount: 0, deletedSize: 0 }
}

const data = new SlashCommandBuilder()
  .setName("download")
  .setDescription("Download and play a YouTube video locally")
  .addStringOption((option) =>
    option
      .setName("url")
      .setDescription("The YouTube URL to download")
      .setRequired(true)
  )

async function execute(interaction, client) {
  const url = interaction.options.getString("url")
  
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
    const { deletedCount: oldFilesDeleted, totalSize: oldFilesSize } = cleanupOldFiles(downloadsDir)
    const { deletedCount: sizeFilesDeleted, deletedSize } = checkAndCleanupDirectory(downloadsDir)

    if (oldFilesDeleted > 0 || sizeFilesDeleted > 0) {
      const totalDeleted = oldFilesDeleted + sizeFilesDeleted
      const totalSizeMB = ((oldFilesSize + deletedSize) / (1024 * 1024)).toFixed(2)
      client.debug(`[Download] Cleaned up ${totalDeleted} old files (${totalSizeMB}MB)`)
    }

    // Download the video
    const downloadProcess = spawn('yt-dlp', [
        url,
        '-x',
        '--audio-format', 'wav',
        '--audio-quality', '0',
        '--no-playlist',
        '--no-warnings',
        '--newline',
        '-o', `${downloadsDir}/%(title)s.%(ext)s`
    ])

    let progressMessage = null
    let lastProgress = 0

    downloadProcess.stdout.on('data', (data) => {
        const output = data.toString()
        // Parse progress from yt-dlp output (e.g., "[download] 45.2% of 10.5MiB at 1.2MiB/s ETA 00:05")
        const progressMatch = output.match(/\[download\]\s+(\d+\.\d+)% of (\d+\.\d+)([KMG]iB) at (\d+\.\d+)([KMG]iB\/s) ETA (\d+:\d+)/)
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
                    progressMessage = interaction.editReply(statusText)
                } else {
                    progressMessage = interaction.editReply(statusText)
                }
            }
        }
    })

    downloadProcess.stderr.on('data', (data) => {
        client.error(`[Download] yt-dlp stderr: ${data}`)
    })

    downloadProcess.on('close', async (code) => {
        if (code !== 0) {
            client.error(`[Download] yt-dlp process exited with code ${code}`)
            await interaction.editReply('Error downloading video. Please try again later.')
            return
        }

        // Find the downloaded file
        const files = fs.readdirSync(downloadsDir)
        client.debug(`[Download] Searching for downloaded file in directory: ${downloadsDir}`)
        client.debug(`[Download] Available files: ${files.join(', ')}`)

        // Get video ID from URL
        const videoId = url.split("v=")[1] || url.split("/").pop()
        client.debug(`[Download] Looking for file containing video ID: ${videoId}`)

        // First try to find by video ID
        let downloadedFile = files.find(file => 
            file.endsWith(".wav") && 
            file.includes(decodeURIComponent(videoId))
        )

        // If not found, try to find the most recently modified WAV file
        if (!downloadedFile) {
            client.debug(`[Download] Could not find file by video ID, trying most recent WAV`)
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
                client.debug(`[Download] Found most recent WAV: ${downloadedFile}`)
            }
        }

        if (!downloadedFile) {
            client.error(`[Download] No WAV files found in directory`)
            throw new Error("Could not find downloaded file")
        }

        const filePath = path.join(downloadsDir, downloadedFile)
        
        // Store download metadata
        const metadataPath = path.join(downloadsDir, '.metadata.json')
        let metadata = {}
        if (fs.existsSync(metadataPath)) {
            try {
                metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'))
            } catch (error) {
                client.error(`[Download] Error reading metadata file:`, error)
            }
        }
        
        // Store download date
        metadata[downloadedFile] = {
            downloadDate: new Date().toISOString(),
            originalUrl: url
        }
        
        try {
            fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2))
            client.debug(`[Download] Updated metadata for ${downloadedFile}`)
        } catch (error) {
            client.error(`[Download] Error writing metadata file:`, error)
        }

        client.debug(`[Download] Using file: ${filePath}`)
        client.debug(`[Download] Absolute file path: ${path.resolve(filePath)}`)

        // Get or create the player
        let player = client.lavalink.getPlayer(interaction.guildId)
        const member = interaction.member
        
        if (!player) {
            // Get the user's voice channel
            if (!member.voice.channel) {
                return interaction.editReply("❌ You must be in a voice channel to use this command.")
            }

            // Create a new player
            player = await client.lavalink.createPlayer({
                guildId: interaction.guildId,
                voiceChannelId: member.voice.channel.id,
                textChannelId: interaction.channelId,
                selfDeaf: true,
                volume: 100 // Set default volume
            })

            // Connect to the voice channel
            await player.connect()
        } else if (player.voiceChannelId !== member.voice.channel.id) {
            return interaction.editReply("❌ You need to be in the same voice channel as the bot!")
        }

        // Ensure connected
        if (!player.connected) {
            if (player.state !== 'CONNECTING') {
                await player.connect()
            }
        }

        // Set volume to 100 if it's not already set
        if (player.volume !== 100) {
            client.debug(`[Download] Setting volume from ${player.volume} to 100`)
            await player.setVolume(100)
        }

        try {
            // Create a track object directly
            client.debug(`[Download] Creating track object for local file`)
            const absolutePath = path.resolve(filePath)
            const fileUri = `file://${absolutePath}`
            client.debug(`[Download] Using file URI: ${fileUri}`)

            const track = {
                info: {
                    title: downloadedFile.replace(".wav", ""),
                    uri: fileUri,
                    sourceName: "local",
                    length: 0, // We don't know the length yet
                    identifier: fileUri,
                    isStream: false,
                    author: "Local File",
                    isSeekable: true
                },
                track: fileUri,
                requester: interaction.user
            }

            client.debug(`[Download] Created track object:`, track)

            // Add track to queue
            client.debug(`[Download] Queue before add:`, player.queue.tracks)
            player.queue.add(track)
            client.debug(`[Download] Queue after add:`, player.queue.tracks)
            
            // Verify the track was added
            if (player.queue.tracks.length === 0) {
                client.error(`[Download] Queue is empty after add operation`)
                throw new Error("Failed to add track to queue - queue is empty after add")
            }

            await interaction.editReply(`✅ Downloaded and added to queue: **${downloadedFile.replace(".wav", "")}**`)

            // Start playback if not already playing
            if (!player.playing && !player.paused) {
                client.debug(`[Download] Starting playback with track:`, player.queue.tracks[0])
                try {
                    await player.play()
                } catch (playError) {
                    client.error(`[Download] Error starting playback:`, playError)
                    throw new Error(`Failed to start playback: ${playError.message}`)
                }
            }
        } catch (error) {
            client.error(`[Download] Error in track handling:`, error)
            throw error
        }
    })

  } catch (error) {
    client.error(`[Download] Error downloading video:`, error)
    await interaction.editReply({
      content: `❌ Failed to download video: ${error.message}`,
      ephemeral: true
    })
  }
}

export default { data, execute }