import { SlashCommandBuilder} from "discord.js"

export default {
  data: new SlashCommandBuilder().setName("leave").setDescription("Tell the bot to leave"),
  /**
   *
   * @param {import('../../lib/BotClient.js').default} client
   * @param {import('discord.js').CommandInteraction} interaction
   *
   */
  async execute(client, interaction) {
    client.debug(`Leave command invoked by ${interaction.user.tag} in guild ${interaction.guild.id}`)
    const guild = interaction.guild
    const member = interaction.member

    // Check if user is in a voice channel
    const voiceChannel = member.voice.channel
    if (!voiceChannel) {
      client.debug("Leave command failed: User not in a voice channel")
      return interaction.reply({ content: "Join a voice channel first!"})
    }

    client.debug(`User ${interaction.user.tag} is in voice channel ${voiceChannel.id}`)

    await interaction.deferReply()
    client.debug("Leave command deferred reply")

    const player = client.lavalink.players.get(guild.id)

    if (!player) { // Check if player exists at all
        client.debug(`Leave command check: No player found for guild ${guild.id}. Checking bot's voice state.`)
        // Optional: Check if the bot *thinks* it's in a channel anyway (e.g., after a crash)
        const botVoiceState = interaction.guild.members.me?.voice
        if (botVoiceState?.channel) {
            client.debug(`Bot is in voice channel ${botVoiceState.channel.id}. Attempting to leave.`)
            try {
                client.lavalink.destroyPlayer(guild.id) // Use Lavalink's destroy method
                await interaction.editReply("Left the voice channel.")
                client.debug("Successfully left voice channel via destroyPlayer.")
            } catch (error) {
                client.error("Error trying to leave voice channel without active player:", error)
                await interaction.editReply("Couldn't leave the channel cleanly. Please disconnect me manually.")
            }
        } else {
            client.debug("Bot is not in a voice channel. Replying 'nothing to leave'.")
            await interaction.editReply("I'm not in a voice channel!")
        }
        return
    }

    client.debug(`Found player for guild ${guild.id}. State: ${player.state}, Playing: ${player.playing}`)

    // No need to check queue if we just want to leave
    // if (!player.queue.current && player.queue.length === 0) {
    //   client.debug("Leave command failed: Player exists but queue is empty")
    //   return interaction.editReply(
    //     "Nothing is playing or queued. If I am stuck, try playing something first, then leave."
    //   )
    // }

    client.debug(`Destroying player for guild ${guild.id}`)
    try {
        await player.destroy()
        client.debug(`Player destroyed for guild ${guild.id}`)
        await interaction.editReply("BYE!")
        client.debug("Leave command successfully executed")
    } catch(error) {
        client.error(`Error destroying player for guild ${guild.id}:`, error)
        await interaction.editReply("An error occurred while trying to leave.")
    }

  },
}
