import { SlashCommandBuilder } from "discord.js"

export default {
  data: new SlashCommandBuilder().setName("queue").setDescription("Get the current queue"),
  /**
   *
   * @param {import('../../lib/BotClient.js').default} client
   * @param {import('discord.js').CommandInteraction} interaction
   *
   */
  async execute(client, interaction) {
    const guild = interaction.guild
    const member = interaction.member

    // Check if user is in a voice channel
    const voiceChannel = member.voice.channel
    if (!voiceChannel) {
      return interaction.reply({ content: "Join a voice channel first!" })
    }

    const player = client.lavalink.players.get(guild.id)

    if (!player || (!player.queue.current && player.queue.tracks.length === 0)) {
      return interaction.reply("Nothing is playing.")
    }

    let response = `Now Playing: **${player.queue.current.info.title}**\n\n`
    if (player.queue.tracks.length > 0) {
      const tracks = player.queue.tracks.slice(0, 10)
      response += "Up Next:\n" + tracks.map((t, i) => `${i + 1}. ${t.info.title}`).join("\n")
    } else {
      response += "_Queue is empty._"
    }

    interaction.reply(response)
  },
}
