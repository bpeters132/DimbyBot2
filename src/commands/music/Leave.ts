import { SlashCommandBuilder, type Message } from "discord.js"
import type BotClient from "../../lib/BotClient.js"
import type { ChatInputCommandInteraction } from "discord.js"
import { guildMemberFromInteraction } from "../../util/guildMember.js"

const DELETE_REPLY_DELAY_MS = 1000 * 10
const DELETE_REPLY_RETRY_MS = 2000

/** Deletes the deferred reply after a delay, with one network retry on transient errors. */
function deleteWithRetry(msg: Message, client: BotClient) {
    setTimeout(() => {
        msg.delete().catch((e: unknown) => {
            client.error("[LeaveCmd] Failed to delete reply (attempt 1):", e)
            const err = e as { code?: string; message?: string }
            if (err.code === "EAI_AGAIN" || err.message?.includes("ECONNRESET")) {
                setTimeout(() => {
                    msg.delete().catch((e2: unknown) =>
                        client.error("[LeaveCmd] Failed to delete reply (attempt 2):", e2)
                    )
                }, DELETE_REPLY_RETRY_MS)
            }
        })
    }, DELETE_REPLY_DELAY_MS)
}

export default {
    data: new SlashCommandBuilder().setName("leave").setDescription("Tell the bot to leave"),
    /** Disconnects the bot from voice and tears down the Lavalink player for this guild. */
    async execute(interaction: ChatInputCommandInteraction, client: BotClient): Promise<unknown> {
        const guild = interaction.guild
        if (!guild) {
            return interaction.reply({ content: "Use this command in a server." })
        }
        client.debug(`Leave command invoked by ${interaction.user.tag} in guild ${guild.id}`)
        const member = guildMemberFromInteraction(interaction)
        if (!member) {
            return interaction.reply({
                content: "Could not resolve your member profile. Try again.",
            })
        }

        // Check if user is in a voice channel
        const voiceChannel = member.voice.channel
        if (!voiceChannel) {
            client.debug("Leave command failed: User not in a voice channel")
            return interaction.reply({ content: "Join a voice channel first!" })
        }

        client.debug(`User ${interaction.user.tag} is in voice channel ${voiceChannel.id}`)

        await interaction.deferReply()
        client.debug("Leave command deferred reply")

        const player = client.lavalink.players.get(guild.id)

        if (!player) {
            // Check if player exists at all
            client.debug(
                `Leave command check: No player found for guild ${guild.id}. Checking bot's voice state.`
            )
            // Optional: Check if the bot *thinks* it's in a channel anyway (e.g., after a crash)
            const botVoiceState = guild.members.me?.voice
            if (botVoiceState?.channel) {
                client.debug(
                    `Bot is in voice channel ${botVoiceState.channel.id}. Attempting to leave.`
                )
                try {
                    await client.lavalink.destroyPlayer(guild.id)
                    await interaction.editReply({ content: "Left the voice channel." })
                    const msg = await interaction.fetchReply()
                    client.debug("Successfully left voice channel via destroyPlayer.")
                    deleteWithRetry(msg, client)
                } catch (error) {
                    client.error(
                        "Error trying to leave voice channel without active player:",
                        error
                    )
                    await interaction.editReply(
                        "Couldn't leave the channel cleanly. Please disconnect me manually."
                    )
                }
            } else {
                client.debug("Bot is not in a voice channel. Replying 'nothing to leave'.")
                await interaction.editReply("I'm not in a voice channel!")
            }
            return
        }

        client.debug(
            `Found player for guild ${guild.id}. Connected: ${player.connected}, Playing: ${player.playing}`
        )

        client.debug(`Destroying player for guild ${guild.id}`)
        try {
            await player.destroy()
            client.debug(`Player destroyed for guild ${guild.id}`)
            // Use fetchReply to get the message object
            await interaction.editReply({ content: "BYE!" })
            const msg = await interaction.fetchReply()
            client.debug("Leave command successfully executed")
            deleteWithRetry(msg, client)
        } catch (error) {
            client.error(`Error destroying player for guild ${guild.id}:`, error)
            await interaction.editReply("An error occurred while trying to leave.")
        }
    },
}
