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
    await interaction.deferReply()
    const query = interaction.options.getString("query")
    const guild = interaction.guild
    const member = interaction.member

    // Check if user is in a voice channel
    const voiceChannel = member.voice.channel
    if (!voiceChannel) {
      return interaction.editReply({ content: "Join a voice channel first!" })
    }

    const player = client.lavalink.getPlayer(guild.id)

    if (!player) {
      return interaction.editReply({ content: "No player found for this guild."})
    }

    const res = await player.search(query, { requester: interaction.user })

    if (!res || !res.tracks?.length) {
      return interaction.editReply({ content: "No tracks found or an error occurred."})
    }

    if (res.loadType === "playlist") {
      return await interaction.editReply({ content: "Playlists are not supported for this command."})

    } else {
      const track = res.tracks[0]
      player.queue.add(track, 0)
      await interaction.editReply(`Added [${track.info.title}](${track.info.uri}) to the top of the queue.`)
    }

    if (!player.playing && !player.paused) {
      player.play()
    }
  },
}
