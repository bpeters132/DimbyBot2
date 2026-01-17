import { SlashCommandBuilder } from "discord.js"

export default {
  data: new SlashCommandBuilder()
    .setName("seek")
    .setDescription("Seek through the currently playing song")
    .addIntegerOption((option) =>
      option.setName("position").setDescription("Time to seek to").setRequired(true)
    ),
  /**
   * Executes the /seek command to jump to a specific position in the current track.
   * @param {import('discord.js').CommandInteraction} interaction The interaction that triggered the command.
   * @param {import('../../lib/BotClient.js').default} client The bot client instance.
   */
  async execute(interaction, client) {
    const position = interaction.options.getInteger("position")
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
    }

    await player.seek(position)
    interaction.reply("Seek complete.")
  },
}
