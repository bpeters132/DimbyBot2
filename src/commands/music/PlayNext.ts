import { SlashCommandBuilder } from "discord.js"
import type BotClient from "../../lib/BotClient.js"
import type { ChatInputCommandInteraction } from "discord.js"
import { guildMemberFromInteraction } from "../../util/guildMember.js"

export default {
  data: new SlashCommandBuilder()
    .setName("playnext")
    .setDescription("Queries and places a song at the top of the queue")
    .addStringOption((option) =>
      option.setName("query").setDescription("The song name or URL").setRequired(true)
    ),
  async execute(interaction: ChatInputCommandInteraction, client: BotClient): Promise<unknown> {
    const guild = interaction.guild
    if (!guild) {
      return interaction.reply({ content: "Use this command in a server." })
    }
    const member = guildMemberFromInteraction(interaction)
    if (!member) {
      return interaction.reply({ content: "Could not resolve your member profile. Try again." })
    }

    const voiceChannel = member.voice.channel
    if (!voiceChannel) {
      return interaction.reply({ content: "Join a voice channel first!" })
    }

    const query = interaction.options.getString("query", true)

    await interaction.deferReply()

    const player = client.lavalink.getPlayer(guild.id)

    if (!player) {
      return interaction.editReply({ content: "No player found for this guild." })
    }

    const botMember = await guild.members.fetchMe()
    if (!botMember.voice.channel || botMember.voice.channel.id !== voiceChannel.id) {
      return interaction.editReply({
        content: "You must be in the same voice channel as the bot to use this command.",
      })
    }

    const res = await player.search(query, { requester: interaction.user })

    if (!res || !res.tracks?.length) {
      return interaction.editReply({ content: "No tracks found or an error occurred." })
    }

    if (res.loadType === "playlist") {
      return interaction.editReply({ content: "Playlists are not supported for this command." })
    }

    const track = res.tracks[0]
    player.queue.add(track, 0)
    return interaction.editReply(`Added [${track.info.title}](${track.info.uri}) to the top of the queue.`)
  },
}
