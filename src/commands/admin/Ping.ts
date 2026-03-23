import { SlashCommandBuilder, EmbedBuilder } from "discord.js"
import type BotClient from "../../lib/BotClient.js"
import type { ChatInputCommandInteraction } from "discord.js"
export default {
    data: new SlashCommandBuilder()
        .setName("ping")
        .setDescription("Replies with pong and latency!"),
    /** Executes the /ping command to check bot and API latency. */
    async execute(interaction: ChatInputCommandInteraction, client: BotClient): Promise<unknown> {
        const sent = await interaction.reply({ content: "Pinging...", fetchReply: true })
        const roundtripLatency = sent.createdTimestamp - interaction.createdTimestamp
        const wsLatency = client.ws.ping

        const embed = new EmbedBuilder()
            .setColor(0x0099ff)
            .setTitle("Pong!")
            .addFields(
                { name: "Roundtrip Latency", value: `${roundtripLatency}ms`, inline: true },
                { name: "WebSocket Latency", value: `${wsLatency}ms`, inline: true }
            )
            .setTimestamp()

        return interaction.editReply({ content: null, embeds: [embed] })
    },
}
