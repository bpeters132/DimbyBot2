import { SlashCommandBuilder, MessageFlags } from "discord.js"

export default {
    data: new SlashCommandBuilder()
        .setName("verboselogging")
        .setDescription("Enable/disable verbose logging (Developer Only)")
        .addSubcommand((subcommand) =>
            subcommand.setName("enable").setDescription("Enable debug-level logging")
        )
        .addSubcommand((subcommand) =>
            subcommand.setName("disable").setDescription("Disable debug-level logging")
        )
        .addSubcommand((subcommand) =>
            subcommand.setName("status").setDescription("Check verbose logging status")
        ),
    /**
     * @param {import('../../lib/BotClient.js').default} client
     * @param {import('discord.js').CommandInteraction} interaction
     */
    async execute(interaction, client) {
        // --- Developer Check ---
        const ownerId = process.env.OWNER_ID

        if (!ownerId) {
            client.error(
                "[VerboseLoggingCmd] Developer ID is not configured as OWNER_ID in environment variables!"
            )
            return interaction.reply({
                content: "Command configuration error: Developer ID not set.",
                flags: [MessageFlags.Ephemeral],
            })
        }

        if (interaction.user.id !== ownerId) {
            client.debug(
                `[VerboseLoggingCmd] Denied access to user ${interaction.user.tag} (${interaction.user.id})`
            )
            return interaction.reply({
                content: "Sorry, this command can only be used by the bot developer.",
                flags: [MessageFlags.Ephemeral],
            })
        }
        // --- End Developer Check ---

        const subcommand = interaction.options.getSubcommand()
        const logger = client.logger

        if (!logger || typeof logger.setDebugEnabled !== "function") {
            client.error("[VerboseLoggingCmd] Logger instance is not available for toggling.")
            return interaction.reply({
                content: "Logger is not available to toggle verbose logging.",
                flags: [MessageFlags.Ephemeral],
            })
        }

        if (subcommand === "enable") {
            logger.setDebugEnabled(true)
            client.info(`[VerboseLoggingCmd] Verbose logging enabled by ${interaction.user.tag}`)
            return interaction.reply({
                content: "✅ Verbose logging enabled for this process.",
                flags: [MessageFlags.Ephemeral],
            })
        }

        if (subcommand === "disable") {
            logger.setDebugEnabled(false)
            client.info(`[VerboseLoggingCmd] Verbose logging disabled by ${interaction.user.tag}`)
            return interaction.reply({
                content: "✅ Verbose logging disabled for this process.",
                flags: [MessageFlags.Ephemeral],
            })
        }

        const enabled = logger.getDebugEnabled()
        return interaction.reply({
            content: `Verbose logging is currently ${enabled ? "enabled" : "disabled"}.`,
            flags: [MessageFlags.Ephemeral],
        })
    },
}
