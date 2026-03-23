import { MessageFlags, type GuildTextBasedChannel, type Interaction } from "discord.js"
import type BotClient from "../lib/BotClient.js"
import { getGuildSettings } from "../util/saveControlChannel.js"
import { handleControlButtonInteraction } from "./handlers/handleControlButtonInteraction.js"
import { cleanupControlChannel } from "./handlers/handleControlChannel.js"

export default (client: BotClient) => {
    client.on("interactionCreate", async (interaction: Interaction) => {
        // --- Button Interaction Handling ---
        if (interaction.isButton()) {
            const { customId, user, guildId } = interaction
            client.debug(
                `[InteractionCreate] Received button interaction: ${customId} in guild ${guildId} from user ${user.id}`
            )

            if (customId.startsWith("control_")) {
                try {
                    await handleControlButtonInteraction(interaction, client)
                } catch (error: unknown) {
                    client.error(
                        `[InteractionCreate] Error in handleControlButtonInteraction customId=${customId} interactionId=${interaction.id}:`,
                        error
                    )
                    try {
                        if (!interaction.replied && !interaction.deferred) {
                            await interaction.reply({
                                content:
                                    "Something went wrong with that control. Try again or use slash commands.",
                                flags: [MessageFlags.Ephemeral],
                            })
                        } else {
                            await interaction.followUp({
                                content:
                                    "Something went wrong with that control. Try again or use slash commands.",
                                flags: [MessageFlags.Ephemeral],
                            })
                        }
                    } catch (notifyErr: unknown) {
                        client.error(
                            `[InteractionCreate] Failed to notify user after control button error (customId=${customId}):`,
                            notifyErr
                        )
                    }
                }
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

            if (interaction.inGuild() && guildId) {
                try {
                    const allSettings = getGuildSettings(client)
                    const guildSettings = allSettings[guildId]

                    if (guildSettings && guildSettings.controlChannelId === channelId) {
                        client.warn(
                            `[InteractionCreate] User ${user.tag} (${user.id}) attempted to use command /${commandName} in the control channel (${channelId}) of guild ${guildId}. Rejecting.`
                        )
                        await interaction.reply({
                            content: "Commands cannot be used in the control channel.",
                        })
                        const ch = interaction.channel
                        const msgId = guildSettings.controlMessageId
                        if (ch?.isTextBased() && msgId) {
                            await cleanupControlChannel(ch as GuildTextBasedChannel, msgId, client)
                        }
                        return
                    }
                } catch (error: unknown) {
                    client.error(
                        `[InteractionCreate] Error fetching guild settings for guild ${guildId} during control channel check:`,
                        error
                    )
                }
            }

            const command = client.commands.get(commandName)

            if (!command) {
                client.error(`[InteractionCreate] No command matching "${commandName}" was found.`)
                try {
                    await interaction.reply({
                        content: `Error: Command "${commandName}" not found!`,
                    })
                } catch (replyError: unknown) {
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
            } catch (error: unknown) {
                // Log the core error regardless
                client.error(`[InteractionCreate] Error executing command "${commandName}":`, error)

                // Attempt to send a generic error reply ONLY if the interaction is still valid
                // and hasn't already been replied to or deferred by the command itself.
                // Commands like eval might handle their own specific error feedback.
                if (!interaction.replied && !interaction.deferred) {
                    try {
                        // Use reply if no response has been attempted yet
                        await interaction.reply({
                            content: `There was an error executing \`/${commandName}\`. Please check the logs or contact the developer.`,
                        })
                    } catch (replyError: unknown) {
                        // Log if even the initial reply fails (e.g., interaction truly invalid for some reason)
                        client.error(
                            `[InteractionCreate] Failed to send generic error reply for ${commandName} (Interaction likely invalid):`,
                            replyError
                        )
                    }
                } else {
                    // If replied or deferred, the command likely tried to handle its own response/error.
                    // We just log the error above and don't try to interact further to avoid conflicts or Unknown Interaction errors.
                    client.debug(
                        `[InteractionCreate] Interaction for ${commandName} was already replied/deferred. Skipping generic error reply.`
                    )
                }
            }
            return
        }

        // --- Other Interaction Types ---
        client.debug(`[InteractionCreate] Ignoring unhandled interaction type: ${interaction.type}`)
    })
}
