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

    const res = await player.search(query)

    if (!res.tracks.length) return interaction.reply("No tracks found!")

    player.queue.add(res.tracks[0])
    interaction.reply(`Added **${res.tracks[0].info.title}** to the queue.`)

    if (!player.playing && !player.paused) {
      player.play()
    }
  },
}
