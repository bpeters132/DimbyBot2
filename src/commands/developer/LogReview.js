import { SlashCommandBuilder, AttachmentBuilder, MessageFlags } from "discord.js"
import fs from "fs"
import path from "path"
import { Buffer } from "node:buffer"

const DEFAULT_LINES = 50
const MAX_LINES = 200
const MAX_INLINE_LENGTH = 1800

export default {
    data: new SlashCommandBuilder()
        .setName("logreview")
        .setDescription("Show recent log lines from the bot (Developer Only)")
        .addIntegerOption((option) =>
            option
                .setName("lines")
                .setDescription(
                    `Number of lines to show (1-${MAX_LINES}, default ${DEFAULT_LINES})`
                )
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(MAX_LINES)
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
                "[LogReviewCmd] Developer ID is not configured as OWNER_ID in environment variables!"
            )
            return interaction.reply({
                content: "Command configuration error: Developer ID not set.",
                flags: [MessageFlags.Ephemeral],
            })
        }

        if (interaction.user.id !== ownerId) {
            client.debug(
                `[LogReviewCmd] Denied access to user ${interaction.user.tag} (${interaction.user.id})`
            )
            return interaction.reply({
                content: "Sorry, this command can only be used by the bot developer.",
                flags: [MessageFlags.Ephemeral],
            })
        }
        // --- End Developer Check ---

        const requestedLines = interaction.options.getInteger("lines") || DEFAULT_LINES
        const logPath = client.logger?.getLogFilePath?.()

        if (!logPath) {
            return interaction.reply({
                content: "Log file path is not configured; file logging may be disabled.",
                flags: [MessageFlags.Ephemeral],
            })
        }

        if (!fs.existsSync(logPath)) {
            return interaction.reply({
                content: `Log file not found at ${logPath}.`,
                flags: [MessageFlags.Ephemeral],
            })
        }

        let contents = ""
        try {
            contents = fs.readFileSync(logPath, "utf8")
        } catch (error) {
            client.error("[LogReviewCmd] Failed to read log file:", error)
            return interaction.reply({
                content: "Failed to read log file. Check server logs for details.",
                flags: [MessageFlags.Ephemeral],
            })
        }

        const lines = contents.trimEnd().split(/\r?\n/)
        const sliceStart = Math.max(0, lines.length - requestedLines)
        const recentLines = lines.slice(sliceStart)
        const recentText = recentLines.join("\n")

        if (!recentText) {
            return interaction.reply({
                content: "Log file is empty.",
                flags: [MessageFlags.Ephemeral],
            })
        }

        const fileName = path.basename(logPath)
        const header = `Showing last ${recentLines.length} lines from ${fileName}.`

        if (recentText.length > MAX_INLINE_LENGTH) {
            const buffer = Buffer.from(recentText, "utf8")
            const attachment = new AttachmentBuilder(buffer, { name: "recent_logs.txt" })
            return interaction.reply({
                content: header,
                files: [attachment],
                flags: [MessageFlags.Ephemeral],
            })
        }

        return interaction.reply({
            content: `${header}\n\n\`\`\`\n${recentText}\n\`\`\``,
            flags: [MessageFlags.Ephemeral],
        })
    },
}
