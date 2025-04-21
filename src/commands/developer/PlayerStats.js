import { SlashCommandBuilder, EmbedBuilder } from "discord.js"

export default {
  data: new SlashCommandBuilder()
    .setName("playerstats")
    .setDescription("Lists guilds with active Lavalink players (Developer Only)"),
  /**
   * @param {import('../../lib/BotClient.js').default} client
   * @param {import('discord.js').CommandInteraction} interaction
   */
  async execute(interaction, client) {
    // --- Developer Check ---
    const ownerId = process.env.OWNER_ID

    if (!ownerId) {
        client.error("[PlayerStatsCmd] Developer ID is not configured as OWNER_ID in environment variables!")
        return interaction.reply({ content: "Command configuration error: Developer ID not set.", ephemeral: true })
    }

    if (interaction.user.id !== ownerId) {
      client.debug(`[PlayerStatsCmd] Denied access to user ${interaction.user.tag} (${interaction.user.id})`)
      return interaction.reply({ content: "Sorry, this command can only be used by the bot developer.", ephemeral: true })
    }
    // --- End Developer Check ---

    client.debug(`[PlayerStatsCmd] Command invoked by developer ${interaction.user.tag}`)

    const players = client.lavalink.players
    const playerCount = players.size
    const guildNames = []

    if (playerCount > 0) {
      for (const player of players.values()) {
        const guild = client.guilds.cache.get(player.guildId)
        guildNames.push(guild ? guild.name : `Guild ID: ${player.guildId} (Name Unavailable)`)
      }
    }

    const embed = new EmbedBuilder()
      .setColor(0x0099FF) // You can change the color
      .setTitle("📊 Active Lavalink Players")
      .setTimestamp()

    if (playerCount === 0) {
      embed.setDescription("No active players found.")
    } else {
      let description = `**Total Players: ${playerCount}**\n\n`
      description += guildNames.join("\n")

      // Handle potential description length limit (4096 chars)
      if (description.length > 4096) {
        description = description.substring(0, 4090) + "\n... (list truncated)"
      }
      embed.setDescription(description)
    }

    await interaction.reply({ embeds: [embed] })
    client.debug(`[PlayerStatsCmd] Replied with player stats embed. Count: ${playerCount}`)
  },
} 