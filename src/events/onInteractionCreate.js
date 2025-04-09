/**
 * @param {import('../lib/BotClient.js').default} client
 * @param {import('discord.js').Interaction} interaction
 */

// Import utility functions using ESM
// Removed unused imports: import { getGuildSettings, updateControlMessage } from "../util/guildSettings.js"
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
      client.debug(
        `[InteractionCreate] Received chat input command: /${commandName} in guild ${interaction.guildId}`
      )
      const command = client.commands.get(commandName)

      if (!command) {
        client.error(`[InteractionCreate] No command matching "${commandName}" was found.`) // Simplified log
        try {
          await interaction.reply({
            content: `Error: Command "${commandName}" not found!`,
            ephemeral: true,
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
              ephemeral: true,
            })
          } else {
            await interaction.reply({
              content: "There was an error while executing this command!",
              ephemeral: true,
            })
          }
        } catch (replyError) {
          client.error(
            `[InteractionCreate] Failed to send execution error reply for ${commandName}:`,
            replyError
          )
        }
      }
      return // Handled chat input command
    }

    // --- Other Interaction Types ---
    client.debug(`[InteractionCreate] Ignoring unhandled interaction type: ${interaction.type}`)
  })
}
