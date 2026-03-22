import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from "discord.js"
import type BotClient from "../../lib/BotClient.js"
import type { ChatInputCommandInteraction } from "discord.js"

import { formatDuration } from "../../util/formatDuration.js"

export default {
  data: new SlashCommandBuilder()
    .setName("playerctl")
    .setDescription("Control or view Lavalink players in specific guilds (Developer Only)")
    .addSubcommand(subcommand =>
      subcommand
        .setName("view")
        .setDescription("View details of a player in a specific guild")
        .addStringOption(option => option.setName("guildid").setDescription("The ID of the guild to view the player for").setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName("skip")
        .setDescription("Force skip the current track for a player in a specific guild")
        .addStringOption(option => option.setName("guildid").setDescription("The ID of the guild to skip the track for").setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName("stop")
        .setDescription("Stop playback and clear the queue for a player in a specific guild")
        .addStringOption(option => option.setName("guildid").setDescription("The ID of the guild to stop the player for").setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName("destroy")
        .setDescription("Destroy the player instance for a specific guild")
        .addStringOption(option => option.setName("guildid").setDescription("The ID of the guild to destroy the player for").setRequired(true))),
  async execute(interaction: ChatInputCommandInteraction, client: BotClient): Promise<unknown> {
    // --- Developer Check ---
    const ownerId = process.env.OWNER_ID
    if (!ownerId) {
      client.error("[PlayerCtl] Developer ID is not configured as OWNER_ID in environment variables!")
      return interaction.reply({ 
        content: "Command configuration error: Developer ID not set.", 
        flags: [MessageFlags.Ephemeral] 
      })
    }
    if (interaction.user.id !== ownerId) {
      client.debug(`[PlayerCtl] Denied access to user ${interaction.user.tag} (${interaction.user.id})`)
      return interaction.reply({ 
        content: "Sorry, this command can only be used by the bot developer.", 
        flags: [MessageFlags.Ephemeral] 
      })
    }
    // --- End Developer Check ---

    const subcommand = interaction.options.getSubcommand()
    const guildId = interaction.options.getString("guildid", true)
    const player = client.lavalink.players.get(guildId)

    client.debug(`[PlayerCtl] Developer ${interaction.user.tag} executing '${subcommand}' for guild ${guildId}`)

    if (!player) {
      return interaction.reply({ content: `❌ No active player found for Guild ID: ${guildId}`})
    }

    await interaction.deferReply({ 
      flags: [MessageFlags.Ephemeral] 
    })

    try {
      switch (subcommand) {
        case "view": {
          const guild = client.guilds.cache.get(guildId)
          const track = player.queue.current
          const queueSize = player.queue.tracks.length
          const voiceCh =
            player.voiceChannelId != null ? client.channels.cache.get(player.voiceChannelId) : undefined
          const voiceName =
            voiceCh && "name" in voiceCh && typeof (voiceCh as { name: string }).name === "string"
              ? (voiceCh as { name: string }).name
              : "Unknown Channel"

          const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle(`Player Status: ${guild?.name ?? "Unknown Guild"} (${guildId})`)
            .addFields(
              { name: "Connected", value: player.connected ? "Yes" : "No", inline: true },
              { name: "Playing", value: player.playing ? "Yes" : "No", inline: true },
              { name: "Volume", value: player.volume?.toString() || "N/A", inline: true },
              { name: "Paused", value: player.paused ? "Yes" : "No", inline: true },
              { name: "Repeat", value: player.repeatMode, inline: true },
              { name: "Node", value: player.node?.id || "N/A", inline: true },
              { name: "Voice Channel", value: `${voiceName} (${player.voiceChannelId ?? "N/A"})` },
              { name: "Text Channel", value: player.textChannelId || "N/A" },
              { name: "Queue Size", value: queueSize.toString(), inline: true }
            )
            .setTimestamp()

          if (track) {
            const position = formatDuration(player.position)
            const duration = formatDuration(track.info.duration)
            embed.addFields(
              { name: "Current Track", value: `[${track.info.title}](${track.info.uri})` },
              { name: "Position", value: `${position} / ${duration}`, inline: true },
              {
                name: "Requester",
                value: (() => {
                  const req = track.requester
                  if (req == null) return "N/A"
                  if (typeof req === "string") return `<@${req}>`
                  if (typeof req === "object" && "id" in req && typeof (req as { id: unknown }).id === "string") {
                    return `<@${(req as { id: string }).id}>`
                  }
                  return "N/A"
                })(),
                inline: true,
              }
            )
          } else {
            embed.addFields({ name: "Current Track", value: "Nothing playing" })
          }

          await interaction.editReply({ embeds: [embed] })
          client.debug(`[PlayerCtl] Showed player view for guild ${guildId}`)
          break
        }
        case "skip": {
          if (!player.queue.current) {
              await interaction.editReply({ content: "❌ Nothing is currently playing in that guild."})
              return
          }
          await player.skip()
          await interaction.editReply(`✅ Force-skipped track in Guild ID: ${guildId}`)
          client.debug(`[PlayerCtl] Force-skipped track for guild ${guildId}`)
          break
        }
        case "stop": {
          await player.stopPlaying()
          await interaction.editReply(`✅ Stopped player and cleared queue in Guild ID: ${guildId}`)
          client.debug(`[PlayerCtl] Stopped player for guild ${guildId}`)
          break
        }
        case "destroy": {
          await player.destroy()
          await interaction.editReply(`✅ Destroyed player instance for Guild ID: ${guildId}`)
          client.debug(`[PlayerCtl] Destroyed player for guild ${guildId}`)
          break
        }
      }
    } catch (error: unknown) {
      client.error(`[PlayerCtl] Error executing '${subcommand}' for guild ${guildId}:`, error)
      const msg = error instanceof Error ? error.message : String(error)
      await interaction.editReply(`❌ An error occurred while executing the command for Guild ID ${guildId}. Check console. Error: ${msg}`)
    }
  },
}
