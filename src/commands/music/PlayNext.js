import { SlashCommandBuilder } from "discord.js"

export default {
  data: new SlashCommandBuilder()
    .setName("playnext")
    .setDescription("Queries and places a song at the top of the queue")
    .addStringOption((option) =>
      option.setName("query").setDescription("The song name or URL").setRequired(true)
    ),
  /**
   *
   * @param {import('../../lib/BotClient.js').default} client
   * @param {import('discord.js').CommandInteraction} interaction
   *
   */
  async execute(interaction, client) {
    const query = interaction.options.getString("query")
    const guild = interaction.guild
    const member = interaction.member

    // Check if user is in a voice channel
    const voiceChannel = member.voice.channel
    if (!voiceChannel) {
      return interaction.reply({ content: "Join a voice channel first!" })
    }

    const player = client.lavalink.getPlayer(guild.id)

    if (!player) {
      return interaction.reply({ content: "No player found for this guild."})
    }

    const res = await player.search(query, { requester: interaction.user })

    if (!res || !res.tracks?.length) {
      return interaction.reply({ content: "No tracks found or an error occurred."})
    }

    if (res.loadType === "playlist") {
      return await interaction.reply({ content: "Playlists are not supported for this command."})

    } else {
      const track = res.tracks[0]
      player.queue.add(track, 0)
      await interaction.reply(`Added [${track.info.title}](${track.info.uri}) to the top of the queue.`)
    }

    if (!player.playing && !player.paused) {
      player.play()
    }
  },
}
