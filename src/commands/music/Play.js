import { SlashCommandBuilder } from "discord.js"
import { handleQueryAndPlay } from "../../util/musicManager.js"

export default {
  data: new SlashCommandBuilder()
    .setName("play")
    .setDescription("Searches for and plays a song")
    .addStringOption((option) =>
      option.setName("query").setDescription("The song name or URL").setRequired(true)
    ),


  /**
   * Executes the /play command to search for and play a track.
   * @param {import('discord.js').CommandInteraction} interaction The interaction that triggered the command.
   * @param {import('../../lib/BotClient.js').default} client The bot client instance.
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

    // Use getPlayer first to potentially reuse existing player
    let player = client.lavalink?.getPlayer(guild.id)

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

    // Ensure connected, connecting if necessary
    if (!player.connected) {
        if (player.state !== 'CONNECTING') {
             await player.connect()
        }
    } else if (player.voiceChannelId !== voiceChannel.id) {
        // Optional: Handle user being in a different channel than the bot
        return interaction.reply({ 
          content: "You need to be in the same voice channel as the bot!"
        })
    }

    // Defer reply as search/connect might take time
    await interaction.deferReply()

    // Use the centralized handler for search, queue, play, and update
    const result = await handleQueryAndPlay(
        client,
        guild.id,
        voiceChannel,
        interaction.channel, // Use interaction channel for feedback
        query,
        interaction.user,
        player
    )

    // Edit the deferred reply with the result
    await interaction.editReply(result.feedbackText || "Something went wrong.")
  },
}
