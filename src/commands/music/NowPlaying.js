import { SlashCommandBuilder } from "discord.js"
import path from "path"
import fs from "fs"

export default {
  data: new SlashCommandBuilder().setName("nowplaying").setDescription("View current playing song"),
  /**
   *
   * @param {import('../../lib/BotClient.js').default} client
   * @param {import('discord.js').CommandInteraction} interaction
   *
   */
  async execute(interaction, client) {
    const guild = interaction.guild
    const member = interaction.member

    // Check if user is in a voice channel
    const voiceChannel = member.voice.channel
    if (!voiceChannel) {
      return interaction.reply({ content: "Join a voice channel first!" })
    }

    const player = client.lavalink.players.get(guild.id)

    if (!player || (!player.queue.current && player.queue.length === 0)) {
      return interaction.reply("Nothing is playing.")
    }

    const track = player.queue.current

    // Optional: format time
    const formatTime = (ms) => {
      const totalSeconds = Math.floor(ms / 1000)
      const minutes = Math.floor(totalSeconds / 60)
      const seconds = totalSeconds % 60
      return `${minutes}:${seconds.toString().padStart(2, "0")}`
    }

    const position = formatTime(player.position)
    const duration = formatTime(track.info.duration)

    // Check if this is a local file
    const downloadsDir = path.join(process.cwd(), "downloads")
    const isLocalFile = fs.existsSync(downloadsDir) && 
                       track.info.uri.startsWith('file://') && 
                       fs.existsSync(track.info.uri.replace('file://', ''))

    // Get source info
    let sourceInfo = "Stream"
    if (isLocalFile) {
      sourceInfo = "Local File"
      // Try to get metadata
      const metadataPath = path.join(downloadsDir, '.metadata.json')
      if (fs.existsSync(metadataPath)) {
        try {
          const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'))
          const fileName = path.basename(track.info.uri.replace('file://', ''))
          if (metadata[fileName]?.originalUrl) {
            sourceInfo = `Local File (from ${metadata[fileName].originalUrl})`
          }
        } catch (error) {
          client.error(`[NowPlaying] Error reading metadata:`, error)
        }
      }
    } else if (track.info.sourceName) {
      sourceInfo = track.info.sourceName.charAt(0).toUpperCase() + track.info.sourceName.slice(1)
    }

    const embed = {
      title: "🎵 Now Playing",
      description: `[${track.info.title}](${track.info.uri})\nBy: \`${track.info.author}\``,
      fields: [
        { name: "Time", value: `\`${position} / ${duration}\``, inline: true },
        { name: "Source", value: sourceInfo, inline: true }
      ],
      thumbnail: { url: track.info.artworkUrl || "" },
      color: 0x00ffaa,
    }

    return interaction.reply({ embeds: [embed] })
  },
}
