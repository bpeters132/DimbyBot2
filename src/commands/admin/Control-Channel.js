import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from "discord.js"
// Import functions from the utility file using ESM
import { getGuildSettings, saveGuildSettings } from "../../util/saveControlChannel.js" // Adjusted path
import {
  createControlEmbed,
  createControlButtons,
} from "../../events/handlers/handleControlChannel.js"

// Command definition using ES Module export
export default {
  data: new SlashCommandBuilder()
    .setName("control-channel")
    .setDescription("Manages the music player control channel.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild) // Only admins
    .setDMPermission(false) // Guild only
    .addSubcommand((subcommand) =>
      subcommand
        .setName("set")
        .setDescription("Sets the current channel as the music control channel.")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("unset")
        .setDescription("Removes the music control channel configuration for this guild.")
    ),
  category: "admin",
  aliases: ["cc"],

  async execute(interaction, client) {
    const { guild, channel, options } = interaction
    const subcommand = options.getSubcommand()
    client.debug(`[Control-Channel] Executing subcommand: ${subcommand} in guild ${guild.id}`)

    const guildSettings = getGuildSettings()

    if (!guildSettings[guild.id]) {
      client.debug(`[Control-Channel] Initializing settings for guild ${guild.id}`)
      guildSettings[guild.id] = {}
    }

    if (subcommand === "set") {
      const targetChannel = channel
      client.debug(
        `[Control-Channel] Setting control channel to ${targetChannel.id} (${targetChannel.name}) in guild ${guild.id}`
      )

      if (targetChannel.type !== ChannelType.GuildText) {
        client.warn(
          `[Control-Channel] Attempted to set non-text channel ${targetChannel.id} as control channel.`
        )
        return interaction.reply({
          content: "Control channel must be a text channel.",
        })
      }

      const botPermissions = targetChannel.permissionsFor(client.user)
      const requiredPerms = [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.ManageMessages,
      ]
      const hasPerms = botPermissions?.has(requiredPerms)

      if (!hasPerms) {
        client.warn(
          `[Control-Channel] Missing permissions in target channel ${targetChannel.id} for guild ${guild.id}. Has: ${botPermissions?.toArray()}, Needs: ${requiredPerms}`
        )
        return interaction.reply({
          content:
            "I need permissions to View Channel, Send Messages, Embed Links, and Manage Messages in the designated control channel.",
        })
      }
      client.debug(`[Control-Channel] Bot has required permissions in channel ${targetChannel.id}.`)

      // Delete old control message if one exists
      const oldChannelId = guildSettings[guild.id]?.controlChannelId
      const oldMessageId = guildSettings[guild.id]?.controlMessageId
      if (oldChannelId && oldMessageId) {
        client.debug(
          `[Control-Channel] Found old control message settings: Channel ${oldChannelId}, Message ${oldMessageId}. Attempting deletion.`
        )
        try {
          const oldChannel = await client.channels.fetch(oldChannelId).catch(() => null)
          if (oldChannel) {
            const oldMessage = await oldChannel.messages.fetch(oldMessageId).catch(() => null)
            if (oldMessage) {
              await oldMessage.delete()
              client.debug(
                `[Control-Channel] Successfully deleted old control message ${oldMessageId} in channel ${oldChannelId}.`
              )
            } else {
              client.debug(
                `[Control-Channel] Old control message ${oldMessageId} not found in channel ${oldChannelId}.`
              )
            }
          } else {
            client.debug(`[Control-Channel] Old control channel ${oldChannelId} not found.`)
          }
        } catch (error) {
          client.warn(
            `[Control-Channel] Could not delete old control message ${oldMessageId} in guild ${guild.id}: ${error}`
          )
        }
      }

      // Send the new control message
      try {
        client.debug(
          `[Control-Channel] Fetching player for initial control message state in guild ${guild.id}.`
        )
        const player = client.lavalink?.getPlayer(guild.id)

        client.debug(`[Control-Channel] Creating initial embed and buttons for guild ${guild.id}.`)
        const controlEmbed = createControlEmbed(client, player)
        const controlButtons = createControlButtons(client, player)

        client.debug(
          `[Control-Channel] Sending new control message to channel ${targetChannel.id} in guild ${guild.id}.`
        )
        const controlMessage = await targetChannel.send({
          embeds: [controlEmbed],
          components: [controlButtons],
        })
        client.debug(`[Control-Channel] Sent new control message ${controlMessage.id}.`)

        guildSettings[guild.id].controlChannelId = targetChannel.id
        guildSettings[guild.id].controlMessageId = controlMessage.id
        client.debug(
          `[Control-Channel] Saving new settings for guild ${guild.id}: Channel ${targetChannel.id}, Message ${controlMessage.id}.`
        )
        saveGuildSettings(guildSettings)

        return interaction.reply({
          content: `Set ${targetChannel} as the music control channel. The control message has been created.`,
        })
      } catch (error) {
        client.error(
          `[Control-Channel] Failed to send control message in guild ${guild.id}: ${error}`
        )
        return interaction.reply({
          content:
            "Failed to create the control message. Please check my permissions in this channel.",
        })
      }
    } else if (subcommand === "unset") {
      client.debug(`[Control-Channel] Unsetting control channel for guild ${guild.id}.`)
      const settings = guildSettings[guild.id]
      if (!settings?.controlChannelId) {
        client.debug(
          `[Control-Channel] No control channel set for guild ${guild.id}. Nothing to unset.`
        )
        return interaction.reply({
          content: "No control channel is currently set for this guild.",
        })
      }

      // Attempt to delete the control message
      const controlChannelId = settings.controlChannelId
      const controlMessageId = settings.controlMessageId
      if (controlMessageId) {
        client.debug(
          `[Control-Channel] Attempting to delete control message ${controlMessageId} in channel ${controlChannelId}.`
        )
        try {
          const controlChannel = await client.channels.fetch(controlChannelId).catch(() => null)
          if (controlChannel) {
            const controlMessage = await controlChannel.messages
              .fetch(controlMessageId)
              .catch(() => null)
            if (controlMessage) {
              await controlMessage.delete()
              client.debug(
                `[Control-Channel] Successfully deleted control message ${controlMessageId} during unset.`
              )
            } else {
              client.debug(
                `[Control-Channel] Control message ${controlMessageId} not found during unset.`
              )
            }
          } else {
            client.debug(
              `[Control-Channel] Control channel ${controlChannelId} not found during unset.`
            )
          }
        } catch (error) {
          client.warn(
            `[Control-Channel] Could not delete control message ${controlMessageId} in guild ${guild.id} during unset: ${error}`
          )
        }
      }

      // Remove settings
      delete settings.controlChannelId
      delete settings.controlMessageId
      client.debug(`[Control-Channel] Removed control channel settings for guild ${guild.id}.`)

      if (Object.keys(settings).length === 0) {
        client.debug(`[Control-Channel] Removing empty settings entry for guild ${guild.id}.`)
        delete guildSettings[guild.id]
      }
      saveGuildSettings(guildSettings)
      client.debug(`[Control-Channel] Saved settings after unset for guild ${guild.id}.`)

      return interaction.reply({
        content: "Music control channel configuration removed.",
      })
    }
  },
}
