import { SlashCommandBuilder } from "discord.js"
import { handleQueryAndPlay } from "../../util/musicManager.js"
import { seedAutoplayHistoryFromPlayer } from "../../util/autoplayHistory.js"

export default {
  data: new SlashCommandBuilder()
    .setName("genre")
    .setDescription("Search by genre or mood and enable autoplay")
    .addStringOption((option) =>
      option.setName("name").setDescription('e.g. "lo-fi", "metal", "jazz"').setRequired(true)
    ),

  /**
   * @param {import('discord.js').CommandInteraction} interaction
   * @param {import('../../lib/BotClient.js').default} client
   */
  async execute(interaction, client) {
    const genreName = interaction.options.getString("name")?.trim()
    if (!genreName) {
      return interaction.reply({ content: "Please provide a genre name." })
    }

    const guild = interaction.guild
    const member = interaction.member

    const voiceChannel = member.voice.channel
    if (!voiceChannel) {
      return interaction.reply({ content: "Join a voice channel first!" })
    }

    let player = client.lavalink?.getPlayer(guild.id)

    if (!player) {
      player = await client.lavalink.createPlayer({
        guildId: guild.id,
        voiceChannelId: voiceChannel.id,
        textChannelId: interaction.channelId,
        selfDeaf: true,
        volume: 100,
      })
    }

    if (player.connected && player.voiceChannelId !== voiceChannel.id) {
      return interaction.reply({
        content: "You need to be in the same voice channel as the bot!",
      })
    }

    await interaction.deferReply()

    const result = await handleQueryAndPlay(
      client,
      guild.id,
      voiceChannel,
      interaction.channel,
      genreName,
      interaction.user,
      player
    )

    if (result.success) {
      const p = client.lavalink.getPlayer(guild.id)
      p?.set("autoplay", true)
      if (p) seedAutoplayHistoryFromPlayer(p)
      await interaction.editReply(
        `Autoplay enabled for **${genreName}**. ${result.feedbackText ?? "Queued."}`
      )
    } else {
      await interaction.editReply(result.feedbackText || "Something went wrong.")
    }
  },
}
