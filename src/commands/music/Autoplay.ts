import { SlashCommandBuilder } from "discord.js"
import type BotClient from "../../lib/BotClient.js"
import type { ChatInputCommandInteraction } from "discord.js"
import { guildMemberFromInteraction } from "../../util/guildMember.js"

import { clearAutoplayRecent, seedAutoplayHistoryFromPlayer } from "../../util/autoplayHistory.js"
import { updateControlMessage } from "../../events/handlers/handleControlChannel.js"

export default {
  data: new SlashCommandBuilder()
    .setName("autoplay")
    .setDescription("Toggle Spotify-based autoplay when the queue runs out"),

  /**
   * @param {import('discord.js').CommandInteraction} interaction
   * @param {import('../../lib/BotClient.js').default} client
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
      return interaction.reply({ content: "There is no player for this guild." })
    }

    if (player.connected && player.voiceChannelId !== voiceChannel.id) {
      return interaction.reply({
        content: "You need to be in the same voice channel as the bot!",
      })
    }

    const current = !!player.get("autoplay")
    player.set("autoplay", !current)
    const enabled = !current
    if (!enabled) {
      clearAutoplayRecent(player)
    } else {
      seedAutoplayHistoryFromPlayer(player)
    }

    await interaction.reply({
      content: enabled ? "Autoplay is now **enabled**." : "Autoplay is now **disabled**.",
    })

    try {
      await updateControlMessage(client, guild.id)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      client.warn(`[Autoplay] updateControlMessage failed: ${msg}`)
    }
  },
}
