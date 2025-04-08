import { SlashCommandBuilder } from "discord.js"

export default {
  data: new SlashCommandBuilder()
    .setName("play")
    .setDescription("Queries and play's a song")
    .addStringOption((option) =>
      option.setName("query").setDescription("The song name or URL").setRequired(true)
    ),
  /**
   *
   * @param {import('../../lib/BotClient.js').default} client
   * @param {import('discord.js').CommandInteraction} interaction
   *
   */
  async execute(client, interaction) {
    const query = interaction.options.getString("query")
    const guild = interaction.guild
    const member = interaction.member

    // Check if user is in a voice channel
    const voiceChannel = member.voice.channel
    if (!voiceChannel) {
      return interaction.reply({ content: "Join a voice channel first!" })
    }

    const player = await client.lavalink.createPlayer({
      guildId: guild.id,
      voiceChannelId: voiceChannel.id,
      textChannelId: interaction.channelId,
      selfDeaf: true,
      selfMute: false,
    })

    player.connect()

    const res = await player.search(query, { requester: interaction.user })

    if (!res || !res.tracks?.length) {
      return interaction.reply({ content: "No tracks found or an error occurred.", ephemeral: true })
    }

    if (res.loadType === "playlist") {
      player.queue.add(res.tracks)
      const playlistTitle = res.playlist?.title ?? "Unknown Playlist"
      const playlistUri = res.playlist?.uri
      const trackCount = res.tracks.length

      let replyMessage = `Added **playlist** ${playlistTitle} (${trackCount} tracks) to the queue.`
      if (playlistUri) {
        replyMessage = `Added **playlist** [${playlistTitle}](${playlistUri}) (${trackCount} tracks) to the queue.`
      }
      await interaction.reply(replyMessage)

    } else {
      const track = res.tracks[0]
      player.queue.add(track)
      await interaction.reply(`Added [${track.info.title}](${track.info.uri}) to the queue.`)
    }

    if (!player.playing && !player.paused) {
      player.play()
    }
  },
}
