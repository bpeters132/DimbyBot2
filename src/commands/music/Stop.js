import { SlashCommandBuilder } from "discord.js"

export default {
  data: new SlashCommandBuilder().setName("stop").setDescription("Stop the player"),
  /**
   *
   * @param {import('../../lib/BotClient.js').default} client
   * @param {import('discord.js').CommandInteraction} interaction
   *
   */
  async execute(client, interaction) {
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

    interaction.reply("BYE!")
  },
}
