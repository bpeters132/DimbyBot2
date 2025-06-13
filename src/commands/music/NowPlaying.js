import { SlashCommandBuilder, EmbedBuilder } from "discord.js"
import { getLocalPlayerState } from "../../util/localPlayer.js"
import { formatDuration } from "../../util/formatDuration.js"

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

    // 1. Check local player state first
    const localPlayerState = getLocalPlayerState(guild.id)

    if (localPlayerState && localPlayerState.isPlaying && localPlayerState.trackTitle) {
      const embed = new EmbedBuilder()
        .setColor(0x00AAFF) // Blue for local player
        .setTitle("🎵 Now Playing (Local)")
        .setDescription(`**${localPlayerState.trackTitle}**`)
        .addFields(
          { name: "Source", value: "Local File", inline: true },
          // @discordjs/voice doesn't easily provide current playback position without more complex tracking
          // So we'll omit position/duration for local files for now, or show "N/A"
          { name: "Time", value: "N/A (Live Stream)", inline: true }
        )
        .setFooter({ text: "Playing via local file stream." })
        .setTimestamp()

      return interaction.reply({ embeds: [embed] })
    }

    // 2. If no local track, check Lavalink player
    const lavalinkPlayer = client.lavalink.players.get(guild.id)

    if (!lavalinkPlayer || !lavalinkPlayer.queue.current) { // Simplified check
      return interaction.reply({ content: "Nothing is playing.", ephemeral: true })
    }

    const track = lavalinkPlayer.queue.current

    // Use your existing formatDuration or a new one if needed
    const position = formatDuration(lavalinkPlayer.position)
    const duration = formatDuration(track.info.duration)

    let sourceInfo = "Stream"
    if (track.info.sourceName) {
      sourceInfo = track.info.sourceName.charAt(0).toUpperCase() + track.info.sourceName.slice(1)
      if (sourceInfo.toLowerCase() === "youtube") {
        sourceInfo = "YouTube"
      }
    }
    // Removed the old local file check via URI as it's now handled by localPlayerState

    const embed = new EmbedBuilder()
      .setColor(0x00FFAA) // Green for Lavalink
      .setTitle("🎵 Now Playing (Lavalink)")
      .setDescription(`[${track.info.title}](${track.info.uri})`)
      .addFields(
        { name: "Artist", value: track.info.author || "Unknown Artist", inline: true },
        { name: "Time", value: `\`${position} / ${duration}\``, inline: true },
        { name: "Source", value: sourceInfo, inline: true },
        { name: "Requester", value: track.requester ? `<@${track.requester.id}>` : "N/A", inline: true }
      )
      // .setThumbnail(track.info.artworkUrl || track.info.thumbnail || null) // artworkUrl is often preferred
      // Updated to use artworkUrl or thumbnail based on common Lavalink track info
      .setThumbnail(track.info.artworkUrl || (track.info.identifier && track.info.sourceName === "youtube" ? `https://img.youtube.com/vi/${track.info.identifier}/hqdefault.jpg` : null))
      .setFooter({ text: `Playing via Lavalink node: ${lavalinkPlayer.node?.id ?? 'Unknown'}` })
      .setTimestamp()

    return interaction.reply({ embeds: [embed] })
  },
}
