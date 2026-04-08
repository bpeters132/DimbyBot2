import { MessageFlags, type GuildTextBasedChannel, type Interaction } from "discord.js"
import type BotClient from "../lib/BotClient.js"
import type { GuildSettings } from "../types/index.js"
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
                let guildSettings: GuildSettings | undefined
                try {
                    const allSettings = getGuildSettings()
                    guildSettings = allSettings[guildId]
                } catch (error: unknown) {
                    client.error(
                        `[InteractionCreate] Error fetching guild settings for guild ${guildId} during control channel check:`,
                        error
                    )
                    return
                }

                if (guildSettings && guildSettings.controlChannelId === channelId) {
                    client.warn(
                        `[InteractionCreate] User ${user.tag} (${user.id}) attempted to use command /${commandName} in the control channel (${channelId}) of guild ${guildId}. Rejecting.`
                    )
                    try {
                        await interaction.reply({
                            content: "Commands cannot be used in the control channel.",
                            flags: [MessageFlags.Ephemeral],
                        })
                    } catch (replyErr: unknown) {
                        client.error(
                            `[InteractionCreate] Failed to reply when rejecting control-channel command /${commandName}:`,
                            replyErr
                        )
                    }
                    const ch = interaction.channel
                    const msgId = guildSettings.controlMessageId
                    if (ch?.isTextBased() && msgId) {
                        try {
                            await cleanupControlChannel(ch as GuildTextBasedChannel, msgId, client)
                        } catch (cleanupErr: unknown) {
                            client.error(
                                `[InteractionCreate] cleanupControlChannel failed after control-channel rejection:`,
                                cleanupErr
                            )
                        }
                    }
                    return
                }
            }

            const command = client.commands.get(commandName)

            if (!command) {
                client.error(`[InteractionCreate] No command matching "${commandName}" was found.`)
                try {
                    await interaction.reply({
                        content: `Error: Command "${commandName}" not found!`,
                        flags: [MessageFlags.Ephemeral],
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

                const genericContent = `There was an error executing \`/${commandName}\`. Please check the logs or contact the developer.`

                if (interaction.deferred && !interaction.replied) {
                    try {
                        await interaction.editReply({ content: genericContent })
                    } catch (editErr: unknown) {
                        client.error(
                            `[InteractionCreate] Failed to editReply after ${commandName} error (deferred):`,
                            editErr
                        )
                        try {
                            await interaction.followUp({
                                content: genericContent,
                                flags: [MessageFlags.Ephemeral],
                            })
                        } catch (followErr: unknown) {
                            client.error(
                                `[InteractionCreate] Failed to followUp after editReply failure for ${commandName}:`,
                                followErr
                            )
                        }
                    }
                } else if (!interaction.replied && !interaction.deferred) {
                    try {
                        await interaction.reply({
                            content: genericContent,
                            flags: [MessageFlags.Ephemeral],
                        })
                    } catch (replyError: unknown) {
                        client.error(
                            `[InteractionCreate] Failed to send generic error reply for ${commandName} (Interaction likely invalid):`,
                            replyError
                        )
                    }
                } else {
                    client.debug(
                        `[InteractionCreate] Interaction for ${commandName} was already replied. Skipping generic error reply.`
                    )
                }
            }
            return
        }

        // --- Other Interaction Types ---
        client.debug(`[InteractionCreate] Ignoring unhandled interaction type: ${interaction.type}`)
    })
}