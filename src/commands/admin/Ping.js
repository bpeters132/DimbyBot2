import { SlashCommandBuilder, EmbedBuilder } from "discord.js"

export default {
  data: new SlashCommandBuilder().setName("ping").setDescription("Replies with pong and latency!"),
  /**
   * Executes the /ping command to check bot and API latency.
   * @param {import('discord.js').CommandInteraction} interaction The interaction that triggered the command.
   * @param {import('../../lib/BotClient.js').default} client The bot client instance.
   */
  async execute(interaction, client) {
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

    await interaction.editReply({ content: null, embeds: [embed] })
  },
}
