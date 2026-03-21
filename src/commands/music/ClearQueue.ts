import { SlashCommandBuilder } from "discord.js"
import type BotClient from "../../lib/BotClient.js"
import type { ChatInputCommandInteraction } from "discord.js"
import { guildMemberFromInteraction } from "../../util/guildMember.js"

export default {
  data: new SlashCommandBuilder()
    .setName("clearqueue")
    .setDescription("Clears all upcoming tracks from the queue, leaving the current song playing."),
  /**
   * @param {import('../../lib/BotClient.js').default} client
   * @param {import('discord.js').CommandInteraction} interaction
   */
  async execute(interaction: ChatInputCommandInteraction, client: BotClient): Promise<unknown> {
    const guild = interaction.guild
    if (!guild) {
      return interaction.reply({ content: "Use this command in a server." })
    }
    const member = guildMemberFromInteraction(interaction)
    if (!member) {
      return interaction.reply({ content: "Could not resolve your member profile. Try again." })
    }

    // Check if user is in a voice channel
    const voiceChannel = member.voice.channel
    if (!voiceChannel) {
      client.debug("[ClearQueue] User not in a voice channel.")
      return interaction.reply({ 
        content: "Join a voice channel first!"
      })
    }

    // Check if bot is in a voice channel
    const botMember = await interaction.guild.members.fetchMe()
    if (!botMember.voice.channel) {
      client.debug("[ClearQueue] Bot not in a voice channel.")
      return interaction.reply({ 
        content: "I'm not in a voice channel!"
      })
    }

    // Check if user is in the same voice channel as the bot
    if (botMember.voice.channel.id !== voiceChannel.id) {
      client.debug("[ClearQueue] User not in the same voice channel as the bot.")
      return interaction.reply({ 
        content: "You must be in the same voice channel as me!"
      })
    }

    const player = client.lavalink.players.get(guild.id)

    if (!player) {
      client.debug("[ClearQueue] No player found for this guild.")
      return interaction.reply({ 
        content: "Nothing is playing right now."
      })
    }

    if (player.queue.tracks.length === 0) {
      client.debug("[ClearQueue] Queue is already empty.")
      return interaction.reply({ 
        content: "The queue is already empty."
      })
    }

    try {
      const queueSize = player.queue.tracks.length
      client.debug(`[ClearQueue] Clearing queue for guild ${guild.id}. Current size: ${queueSize}`)
      
      await player.queue.splice(0, queueSize)

      await interaction.reply({ content: `Cleared ${queueSize} tracks from the queue.` })
      client.debug(`[ClearQueue] Successfully cleared queue for guild ${guild.id}`)
    
    } catch (error) {
      client.error("[ClearQueue] Error clearing the queue:", error)
      await interaction.reply({ 
        content: "An error occurred while trying to clear the queue."
      })
    }
  },
}
