import { SlashCommandBuilder } from "discord.js"
import type BotClient from "../../lib/BotClient.js"
import type { ChatInputCommandInteraction } from "discord.js"
import { guildMemberFromInteraction } from "../../util/guildMember.js"


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
  async execute(interaction: ChatInputCommandInteraction, client: BotClient): Promise<unknown> {
    const position = interaction.options.getInteger("position", true)
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

    const player = client.lavalink.players.get(guild.id)

    if (!player || (!player.queue.current && player.queue.tracks.length === 0)) {
      return interaction.reply("Nothing is playing.")
    }

    await player.seek(position)
    await interaction.reply("Seek complete.")
  },
}
