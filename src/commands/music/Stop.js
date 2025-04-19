import { SlashCommandBuilder } from "discord.js"

export default {
  data: new SlashCommandBuilder().setName("stop").setDescription("Stop the player"),
  /**
   * @param {import('../../lib/BotClient.js').default} client
   * @param {import('discord.js').CommandInteraction} interaction
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

    player.destroy()

    // Use fetchReply to get the message object
    const msg = await interaction.reply({ content: "BYE!", fetchReply: true })
    // Delete after delay with retry
    setTimeout(() => {
      msg.delete().catch((e) => {
        client.error("[StopCmd] Failed to delete reply (attempt 1):", e)
        if (e.code === 'EAI_AGAIN' || e.message.includes('ECONNRESET')) {
          setTimeout(() => {
            msg.delete().catch((e2) => client.error("[StopCmd] Failed to delete reply (attempt 2):", e2))
          }, 2000) // Retry after 2 seconds
        }
      })
    }, 1000 * 10) // 10 seconds initial delay
  },
}
