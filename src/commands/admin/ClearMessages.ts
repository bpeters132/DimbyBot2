import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js"
import type BotClient from "../../lib/BotClient.js"
import type { ChatInputCommandInteraction } from "discord.js"

function isGuildBulkDeletableChannel(
  ch: NonNullable<ChatInputCommandInteraction["channel"]>
): ch is import("discord.js").GuildTextBasedChannel {
  return "bulkDelete" in ch && typeof (ch as { bulkDelete?: unknown }).bulkDelete === "function"
}

export default {
  data: new SlashCommandBuilder()
    .setName("clearmessages")
    .setDescription("Clear up to 30 messages")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption((option) =>
      option.setName("count").setDescription("The number of messages to clear").setRequired(true)
    ),

  async execute(interaction: ChatInputCommandInteraction, client: BotClient): Promise<unknown> {
    const clear_amount = interaction.options.getInteger("count", true)
    const channel = interaction.channel

    if (!interaction.inGuild() || !channel || !isGuildBulkDeletableChannel(channel)) {
      return interaction.reply({
        content: "Use this command in a server text channel where bulk delete is available.",
        ephemeral: true,
      })
    }

    if (clear_amount > 30) {
      return interaction.reply({
        content: "You can only clear up to 30 messages at once!",
        ephemeral: true,
      })
    }

    try {
      const messages = await channel.messages.fetch({ limit: clear_amount })
      const deletableMessages = messages.filter((m) => !m.interaction)

      if (deletableMessages.size > 0) {
        await channel.bulkDelete(deletableMessages, true)
        return interaction.reply({
          content: `Cleared ${deletableMessages.size} messages!`,
          ephemeral: true,
        })
      }

      return interaction.reply({
        content:
          "No deletable messages found (or only the command itself). Messages older than 14 days or other interaction replies cannot be bulk deleted.",
        ephemeral: true,
      })
    } catch (error) {
      client.error("Error during bulk delete in clearmessages command:", error)
      const replyOptions = {
        content:
          "An error occurred while clearing messages. Ensure the bot has Manage Messages permission and messages are not older than 14 days.",
        ephemeral: true as const,
      }
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(replyOptions).catch((e: unknown) =>
          client.error("Failed to follow up error reply for clearmessages:", e)
        )
      } else {
        await interaction.reply(replyOptions).catch((e: unknown) =>
          client.error("Failed to send error reply for clearmessages:", e)
        )
      }
      return
    }
  },
}
