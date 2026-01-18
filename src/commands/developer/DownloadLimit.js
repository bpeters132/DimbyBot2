import { SlashCommandBuilder, MessageFlags } from "discord.js"
import { getGuildSettings, saveGuildSettings } from "../../util/saveControlChannel.js"

const DEFAULT_MAX_DIR_SIZE_MB = 1000

export default {
  data: new SlashCommandBuilder()
    .setName("downloadlimit")
    .setDescription("Manage per-guild download storage limits (Developer Only)")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("show")
        .setDescription("Show the current download size limit for a guild")
        .addStringOption((option) =>
          option
            .setName("guildid")
            .setDescription("Target guild ID (defaults to current guild)")
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("set")
        .setDescription("Set the download size limit (MB) for a guild")
        .addNumberOption((option) =>
          option
            .setName("size_mb")
            .setDescription("Maximum size in MB")
            .setRequired(true)
            .setMinValue(1)
        )
        .addStringOption((option) =>
          option
            .setName("guildid")
            .setDescription("Target guild ID (defaults to current guild)")
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("clear")
        .setDescription("Clear the custom download size limit for a guild")
        .addStringOption((option) =>
          option
            .setName("guildid")
            .setDescription("Target guild ID (defaults to current guild)")
            .setRequired(false)
        )
    ),
  /**
   * @param {import('../../lib/BotClient.js').default} client
   * @param {import('discord.js').CommandInteraction} interaction
   */
  async execute(interaction, client) {
    const ownerId = process.env.OWNER_ID
    if (!ownerId) {
      client.error("[DownloadLimit] Developer ID is not configured as OWNER_ID in environment variables!")
      return interaction.reply({
        content: "Command configuration error: Developer ID not set.",
        flags: [MessageFlags.Ephemeral],
      })
    }
    if (interaction.user.id !== ownerId) {
      client.debug(`[DownloadLimit] Denied access to user ${interaction.user.tag} (${interaction.user.id})`)
      return interaction.reply({
        content: "Sorry, this command can only be used by the bot developer.",
        flags: [MessageFlags.Ephemeral],
      })
    }

    const subcommand = interaction.options.getSubcommand()
    const targetGuildId = interaction.options.getString("guildid") || interaction.guildId

    if (!targetGuildId) {
      return interaction.reply({
        content: "Guild ID is required when running this command outside a guild.",
        flags: [MessageFlags.Ephemeral],
      })
    }

    const settings = getGuildSettings()
    if (!settings[targetGuildId]) {
      settings[targetGuildId] = {}
    }

    if (subcommand === "show") {
      const configured = settings[targetGuildId].downloadsMaxMb
      const parsed = Number.parseFloat(configured)
      const limit = Number.isNaN(parsed) ? DEFAULT_MAX_DIR_SIZE_MB : parsed
      const suffix = Number.isNaN(parsed) ? " (default)" : " (custom)"
      return interaction.reply({
        content: `Download limit for guild ${targetGuildId}: ${limit}MB${suffix}.`,
        flags: [MessageFlags.Ephemeral],
      })
    }

    if (subcommand === "set") {
      const sizeMb = interaction.options.getNumber("size_mb")
      settings[targetGuildId].downloadsMaxMb = sizeMb
      saveGuildSettings(settings)
      return interaction.reply({
        content: `Set download limit for guild ${targetGuildId} to ${sizeMb}MB.`,
        flags: [MessageFlags.Ephemeral],
      })
    }

    if (subcommand === "clear") {
      if (settings[targetGuildId]?.downloadsMaxMb !== undefined) {
        delete settings[targetGuildId].downloadsMaxMb
        if (Object.keys(settings[targetGuildId]).length === 0) {
          delete settings[targetGuildId]
        }
        saveGuildSettings(settings)
      }
      return interaction.reply({
        content: `Cleared custom download limit for guild ${targetGuildId}. Default is ${DEFAULT_MAX_DIR_SIZE_MB}MB.`,
        flags: [MessageFlags.Ephemeral],
      })
    }
  },
}
