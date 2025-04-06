import { SlashCommandBuilder } from "discord.js"

export default {
  data: new SlashCommandBuilder().setName("ping").setDescription("Replies with pong!"),
  /**
   *
   * @param {import('discord.js').Client} client
   * @param {import('discord.js').CommandInteraction} interaction
   */
  async execute(client, interaction) {
    console.log("Pong!")
    await interaction.reply("Pong!")
  },
}
