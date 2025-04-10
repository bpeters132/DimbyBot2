/**
 * @param {import('../lib/BotClient.js').default} client
 * @param {import('discord.js').Interaction} interaction
 */

// Import utility functions using ESM
import { getGuildSettings } from "../util/saveControlChannel.js"
import { handleControlButtonInteraction } from "./handlers/handleControlButtonInteraction.js"

export default (client) => {
  client.on("interactionCreate", async (interaction) => {
    // --- Button Interaction Handling ---
    if (interaction.isButton()) {
      const { customId, user, guildId } = interaction
      client.debug(
        `[InteractionCreate] Received button interaction: ${customId} in guild ${guildId} from user ${user.id}`
      )

      if (customId.startsWith("control_")) {
        await handleControlButtonInteraction(interaction, client)
        return
      }

      client.debug(
        `[InteractionCreate] Ignoring button interaction with non-control customId: ${customId}`
      )
      return
    }

    // --- Chat Input Command Handling ---
    if (interaction.isChatInputCommand()) {
      const commandName = interaction.commandName
      const guildId = interaction.guildId
      const channelId = interaction.channelId
      const user = interaction.user

      client.debug(
        `[InteractionCreate] Received chat input command: /${commandName} in guild ${guildId} from user ${user.tag} (${user.id}) in channel ${channelId}`
      )

      // Check if the command is used in the control channel
      if (interaction.inGuild()) {
        try {
          const allSettings = getGuildSettings() // Get the entire settings object
          const guildSettings = allSettings[guildId] // Get settings for the specific guild

          // Check if this guild has settings AND if the command is in its control channel
          if (guildSettings && guildSettings.controlChannelId === channelId) {
            client.warn(
              `[InteractionCreate] User ${user.tag} (${user.id}) attempted to use command /${commandName} in the control channel (${channelId}) of guild ${guildId}. Rejecting.`
            )
            await interaction.reply({
              content: "Commands cannot be used in the control channel.",
            })
            return
          }
        } catch (error) {
          client.error(`[InteractionCreate] Error fetching guild settings for guild ${guildId} during control channel check:`, error)
        }
      }

      const command = client.commands.get(commandName)

      if (!command) {
        client.error(`[InteractionCreate] No command matching "${commandName}" was found.`)
        try {
          await interaction.reply({
            content: `Error: Command "${commandName}" not found!`,
          })
        } catch (replyError) {
          client.error(
            `[InteractionCreate] Failed to send 'command not found' reply for ${commandName}:`,
            replyError
          )
        }
        return
      }

      try {
        client.info(
          `[InteractionCreate] Executing command "${commandName}" for user ${interaction.user.tag} (${interaction.user.id}) in guild ${interaction.guild?.name ?? "DM"} (${interaction.guild?.id ?? "N/A"})`
        )
        await command.execute(interaction, client)
        client.debug(`[InteractionCreate] Successfully executed command "${commandName}".`)
      } catch (error) {
        client.error(`[InteractionCreate] Error executing command "${commandName}":`, error)
        try {
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp({
              content: "There was an error while executing this command!",
            })
          } else {
            await interaction.reply({
              content: "There was an error while executing this command!",
            })
          }
        } catch (replyError) {
          client.error(
            `[InteractionCreate] Failed to send execution error reply for ${commandName}:`,
            replyError
          )
        }
      }
      return
    }

    // --- Other Interaction Types ---
    client.debug(`[InteractionCreate] Ignoring unhandled interaction type: ${interaction.type}`)
  })
}
