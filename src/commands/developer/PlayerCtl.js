import { SlashCommandBuilder, EmbedBuilder } from "discord.js"
import { formatDuration } from "../../util/formatDuration.js"

export default {
  data: new SlashCommandBuilder()
    .setName("playerctl")
    .setDescription("Control or view Lavalink players in specific guilds (Developer Only)")
    .addSubcommand(subcommand =>
      subcommand
        .setName("view")
        .setDescription("View details of a player in a specific guild")
        .addStringOption(option => option.setName("guildid").setDescription("The ID of the guild to view the player for").setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName("skip")
        .setDescription("Force skip the current track for a player in a specific guild")
        .addStringOption(option => option.setName("guildid").setDescription("The ID of the guild to skip the track for").setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName("stop")
        .setDescription("Stop playback and clear the queue for a player in a specific guild")
        .addStringOption(option => option.setName("guildid").setDescription("The ID of the guild to stop the player for").setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName("destroy")
        .setDescription("Destroy the player instance for a specific guild")
        .addStringOption(option => option.setName("guildid").setDescription("The ID of the guild to destroy the player for").setRequired(true))),
  /**
   * @param {import('../../lib/BotClient.js').default} client
   * @param {import('discord.js').CommandInteraction} interaction
   */
  async execute(interaction, client) {
    // --- Developer Check ---
    const ownerId = process.env.OWNER_ID
    if (!ownerId) {
      client.error("[PlayerCtl] Developer ID is not configured as OWNER_ID in environment variables!")
      return interaction.reply({ content: "Command configuration error: Developer ID not set.", ephemeral: true})
    }
    if (interaction.user.id !== ownerId) {
      client.debug(`[PlayerCtl] Denied access to user ${interaction.user.tag} (${interaction.user.id})`)
      return interaction.reply({ content: "Sorry, this command can only be used by the bot developer.", ephemeral: true})
    }
    // --- End Developer Check ---

    const subcommand = interaction.options.getSubcommand()
    const guildId = interaction.options.getString("guildid")
    const player = client.lavalink.players.get(guildId)

    client.debug(`[PlayerCtl] Developer ${interaction.user.tag} executing '${subcommand}' for guild ${guildId}`)

    if (!player) {
      return interaction.reply({ content: `❌ No active player found for Guild ID: ${guildId}`})
    }

    await interaction.deferReply({ ephemeral: true })

    try {
      switch (subcommand) {
        case "view": {
          const guild = client.guilds.cache.get(guildId) || { name: "Unknown Guild" }
          const track = player.queue.current
          const queueSize = player.queue.tracks.length
          const voiceChannel = client.channels.cache.get(player.voiceChannelId) || { name: "Unknown Channel" }

          const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle(`Player Status: ${guild.name} (${guildId})`)
            .addFields(
              { name: "State", value: player.state || "N/A", inline: true },
              { name: "Playing", value: player.playing ? "Yes" : "No", inline: true },
              { name: "Volume", value: player.volume?.toString() || "N/A", inline: true },
              { name: "Paused", value: player.paused ? "Yes" : "No", inline: true },
              { name: "Looping", value: player.loop || "N/A", inline: true }, // Assuming loop is directly on player
              { name: "Node", value: player.node?.id || "N/A", inline: true }, // Assuming node info is available
              { name: "Voice Channel", value: `${voiceChannel.name} (${player.voiceChannelId || "N/A"})` },
              { name: "Text Channel", value: player.textChannelId || "N/A" },
              { name: "Queue Size", value: queueSize.toString(), inline: true },
              { name: "Connected", value: player.connected ? "Yes" : "No", inline: true }
            )
            .setTimestamp()

          if (track) {
            const position = formatDuration(player.position)
            const duration = formatDuration(track.info.duration)
            embed.addFields(
              { name: "Current Track", value: `[${track.info.title}](${track.info.uri})` },
              { name: "Position", value: `${position} / ${duration}`, inline: true },
              { name: "Requester", value: track.requester ? `<@${track.requester}>` : "N/A", inline: true }
            )
          } else {
            embed.addFields({ name: "Current Track", value: "Nothing playing" })
          }

          await interaction.editReply({ embeds: [embed] })
          client.debug(`[PlayerCtl] Showed player view for guild ${guildId}`)
          break
        }
        case "skip": {
          if (!player.queue.current) {
              await interaction.editReply({ content: "❌ Nothing is currently playing in that guild."})
              return
          }
          await player.skip()
          await interaction.editReply(`✅ Force-skipped track in Guild ID: ${guildId}`)
          client.debug(`[PlayerCtl] Force-skipped track for guild ${guildId}`)
          break
        }
        case "stop": {
          await player.stop()
          await interaction.editReply(`✅ Stopped player and cleared queue in Guild ID: ${guildId}`)
          client.debug(`[PlayerCtl] Stopped player for guild ${guildId}`)
          break
        }
        case "destroy": {
          await player.destroy()
          await interaction.editReply(`✅ Destroyed player instance for Guild ID: ${guildId}`)
          client.debug(`[PlayerCtl] Destroyed player for guild ${guildId}`)
          break
        }
      }
    } catch (error) {
      client.error(`[PlayerCtl] Error executing '${subcommand}' for guild ${guildId}:`, error)
      await interaction.editReply(`❌ An error occurred while executing the command for Guild ID ${guildId}. Check console. Error: ${error.message}`)
    }
  },
} 