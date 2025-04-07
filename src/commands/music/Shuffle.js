import { SlashCommandBuilder } from "discord.js"

export default {
  data: new SlashCommandBuilder().setName("shuffle").setDescription("Shuffle the current queue"),
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

    if (!player || (!player.queue.current && player.queue.tracks.length === 0)) {
      return interaction.reply("Nothing is playing.")
    } else if (player.queue.current && player.queue.tracks.length === 0) {
      return interaction.reply("The last song of the queue is already playing!")
    }

    await player.queue.shuffle()
    interaction.reply("Queue Shuffled!")
  },
}
