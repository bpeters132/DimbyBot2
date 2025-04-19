import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js"

export default {
  data: new SlashCommandBuilder()
    .setName("clearmessages") // Renamed from "clear"
    .setDescription("Used to clear messages, can clear up to 30 messages")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption((option) =>
      option.setName("count").setDescription("The amount of messages to clear").setRequired(true)
    ),

  /**
   *
   * @param {import('discord.js').Client} client
   * @param {import('discord.js').CommandInteraction} interaction
   *
   */
  async execute(interaction, client) {
    const clear_amount = interaction.options.getInteger("count")
    const channel = interaction.channel

    if (clear_amount <= 30) {
      try {
        // Fetch messages to ensure we don't fail on ephemeral messages
        const messages = await channel.messages.fetch({ limit: clear_amount + 1 })
        const deletableMessages = messages.filter(m => !m.interaction && !m.flags.has('Ephemeral')) // Filter out interaction replies and ephemeral

        if (deletableMessages.size > 0) {
            await channel.bulkDelete(deletableMessages, true) // Pass true to filter messages older than 14 days automatically
            // Reply ephemerally after potentially deleting the interaction reply itself
            await interaction.reply({ content: `Cleared ${deletableMessages.size - 1} messages!`, ephemeral: true }) 
        } else {
            // Handle case where only the command interaction message was fetched (or none)
            await interaction.reply({ content: "No deletable messages found (or only the command itself). Messages older than 14 days or other interaction replies cannot be bulk deleted.", ephemeral: true })
        }
        
      } catch (error) {
        client.error("Error during bulk delete in clearmessages command:", error)
        // Try to reply ephemerally if possible
        const replyOptions = { content: "An error occurred while clearing messages. Ensure the bot has Manage Messages permission and messages are not older than 14 days.", ephemeral: true }
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(replyOptions).catch(e => client.error("Failed to follow up error reply for clearmessages:", e))
        } else {
          await interaction.reply(replyOptions).catch(e => client.error("Failed to send error reply for clearmessages:", e))
        }
      }
    } else {
      await interaction.reply({ content: "You can only clear up to 30 messages at once!", ephemeral: true })
    }
  },
} 