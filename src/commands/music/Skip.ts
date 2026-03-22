import { SlashCommandBuilder } from "discord.js"
import type BotClient from "../../lib/BotClient.js"
import type { ChatInputCommandInteraction } from "discord.js"
import { guildMemberFromInteraction } from "../../util/guildMember.js"


export default {
  data: new SlashCommandBuilder().setName("skip").setDescription("Skip the song"),
  /**
   * Executes the /skip command to skip the current track.
   * @param {import('discord.js').CommandInteraction} interaction The interaction that triggered the command.
   * @param {import('../../lib/BotClient.js').default} client The bot client instance.
   */
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

    const player = client.lavalink.getPlayer(guild.id)

    if (!player) {
      return interaction.reply({ content: "Nothing is playing." })
    }

    if (player.voiceChannelId && player.voiceChannelId !== voiceChannel.id) {
      return interaction.reply({
        content: "You need to be in the same voice channel as the bot!",
      })
    }

    const hasCurrent = !!player.queue.current
    const hasQueued = player.queue.tracks.length > 0

    if (!hasCurrent && !hasQueued) {
      return interaction.reply({ content: "Nothing is playing." })
    }

    await interaction.deferReply()

    try {
      if (hasQueued) {
        await player.skip()
      } else {
        // Only the current track (e.g. autoplay with an empty upcoming queue).
        // Default skip() throws when queue.tracks is empty — use throwError: false.
        await player.skip(0, false)
      }
    } catch (e) {
      client.error("[SkipCmd] skip failed:", e)
      return interaction.editReply({
        content: "Could not skip right now. Try again in a moment.",
      })
    }

    const msg = await interaction.editReply({ content: "Skipped!" })
    setTimeout(() => {
      msg.delete().catch((e) => {
        client.error("[SkipCmd] Failed to delete reply (attempt 1):", e)
        if (e.code === "EAI_AGAIN" || e.message.includes("ECONNRESET")) {
          setTimeout(() => {
            msg.delete().catch((e2) => client.error("[SkipCmd] Failed to delete reply (attempt 2):", e2))
          }, 2000)
        }
      })
    }, 1000 * 10)
  },
}
