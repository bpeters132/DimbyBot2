import { SlashCommandBuilder } from "discord.js"
import type BotClient from "../../lib/BotClient.js"
import type { ChatInputCommandInteraction } from "discord.js"
import { guildMemberFromInteraction } from "../../util/guildMember.js"
import { handleQueryAndPlay } from "../../util/musicManager.js"

export default {
  data: new SlashCommandBuilder()
    .setName("play")
    .setDescription("Searches for and plays a song")
    .addStringOption((option) =>
      option.setName("query").setDescription("The song name or URL").setRequired(true)
    ),

  async execute(interaction: ChatInputCommandInteraction, client: BotClient): Promise<unknown> {
    const query = interaction.options.getString("query", true)
    const guild = interaction.guild
    if (!guild) {
      return interaction.reply({ content: "Use this command in a server." })
    }
    const member = guildMemberFromInteraction(interaction)
    if (!member) {
      return interaction.reply({ content: "Could not resolve your member profile. Try again." })
    }

    // Check if user is in a voice channel
    const voiceChannel = member.voice.channel
    if (!voiceChannel) {
      return interaction.reply({ content: "Join a voice channel first!" })
    }

    // Use getPlayer first to potentially reuse existing player
    let player = client.lavalink.getPlayer(guild.id)

    if (!player) {
        player = await client.lavalink.createPlayer({
            guildId: guild.id,
            voiceChannelId: voiceChannel.id,
            textChannelId: interaction.channelId, // Bind player to interaction channel initially
            selfDeaf: true,
            // selfMute: false, // Default is false
            volume: 100 // Default volume
        })
    }

    if (player.connected && player.voiceChannelId !== voiceChannel.id) {
        // Optional: Handle user being in a different channel than the bot
        return interaction.reply({ 
          content: "You need to be in the same voice channel as the bot!"
        })
    }

    const textChannel = interaction.channel
    if (!textChannel?.isTextBased() || textChannel.isDMBased()) {
      return interaction.reply({ content: "Use this command in a server text channel." })
    }

    await interaction.deferReply()

    const result = await handleQueryAndPlay(
      client,
      guild.id,
      voiceChannel,
      textChannel,
      query,
      interaction.user,
      player
    )

    // Edit the deferred reply with the result
    await interaction.editReply(result.feedbackText || "Something went wrong.")
  },
}
