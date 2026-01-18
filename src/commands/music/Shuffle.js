import { SlashCommandBuilder } from "discord.js"

export default {
  data: new SlashCommandBuilder().setName("shuffle").setDescription("Shuffle the current queue"),
  /**
   * Executes the /shuffle command to shuffle the queue.
   * @param {import('discord.js').CommandInteraction} interaction The interaction that triggered the command.
   * @param {import('../../lib/BotClient.js').default} client The bot client instance.
   */
  async execute(interaction, client) {
    const guild = interaction.guild
    const member = interaction.member

    // Check if user is in a voice channel
    const voiceChannel = member.voice.channel
    if (!voiceChannel) {
      return await interaction.reply({ content: "Join a voice channel first!" })
    }

    const player = client.lavalink.players.get(guild.id)

    if (!player || (!player.queue.current && player.queue.tracks.length === 0)) {
      return await interaction.reply("Nothing is playing.")
    } else if (player.queue.current && player.queue.tracks.length === 0) {
      return await interaction.reply("The last song in the queue is already playing!")
    }

    await player.queue.shuffle()
    await interaction.reply("Queue shuffled.")
  },
}
