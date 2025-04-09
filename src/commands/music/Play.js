import { SlashCommandBuilder } from "discord.js"
// Import the centralized handler
import { handleQueryAndPlay } from "../../util/musicManager.js"
// updateControlMessage is called within handleQueryAndPlay now
// import { updateControlMessage } from "../../util/guildSettings.js"

export default {
  data: new SlashCommandBuilder()
    .setName("play")
    .setDescription("Queries and play's a song")
    .addStringOption((option) =>
      option.setName("query").setDescription("The song name or URL").setRequired(true)
    ),
  /**
   *
   * @param {import('discord.js').CommandInteraction} interaction
   * @param {import('../../lib/BotClient.js').default} client
   *
   */
  async execute(interaction, client) {
    const query = interaction.options.getString("query")
    const guild = interaction.guild
    const member = interaction.member

    // Check if user is in a voice channel
    const voiceChannel = member.voice.channel
    if (!voiceChannel) {
      return interaction.reply({ content: "Join a voice channel first!" })
    }

    // Use getPlayer first to potentially reuse existing player
    let player = client.lavalink?.getPlayer(guild.id)

    if (!player) {
        player = await client.lavalink.createPlayer({
            guildId: guild.id,
            voiceChannelId: voiceChannel.id,
            textChannelId: interaction.channelId, // Bind player to interaction channel initially
            selfDeaf: true,
            // selfMute: false, // Default is false
            volume: 100 // Default volume
        })
    }

    // Ensure connected, connecting if necessary
    if (!player.connected) {
        if (player.state !== 'CONNECTING') {
             await player.connect()
        }
    } else if (player.voiceChannelId !== voiceChannel.id) {
        // Optional: Handle user being in a different channel than the bot
        return interaction.reply({ content: "You need to be in the same voice channel as the bot!", ephemeral: true })
    }

    // Defer reply as search/connect might take time
    await interaction.deferReply()

    // Use the centralized handler for search, queue, play, and update
    const result = await handleQueryAndPlay(
        client,
        guild.id,
        voiceChannel,
        interaction.channel, // Use interaction channel for feedback
        query,
        interaction.user,
        player
    )

    // Edit the deferred reply with the result
    await interaction.editReply(result.feedbackText || "Something went wrong.")

    // Original logic replaced by handleQueryAndPlay:
    /*
    const res = await player.search({ query: query }, interaction.user) // Pass query obj and requester

    if (!res || res.loadType === 'NO_MATCHES' || res.loadType === 'LOAD_FAILED') {
      let errorMsg = "No tracks found or an error occurred."
      if (res?.loadType === 'LOAD_FAILED') {
          errorMsg = `Failed to load tracks: ${res.exception?.message || 'Unknown reason'}`
          client.error(`[PlayCommand] Lavalink load failed: ${res.exception?.message}`, res.exception)
      }
      return interaction.reply({ content: errorMsg, ephemeral: true })
    }

    // Add tracks to queue
    if (res.loadType === "playlist") {
      player.queue.add(res.tracks)
      const playlistTitle = res.playlist?.name ?? "Unknown Playlist"
      const playlistUri = res.playlist?.uri
      const trackCount = res.tracks.length

      let replyMessage = `Added **playlist** "${playlistTitle}" (${trackCount} tracks) to the queue.`
      if (playlistUri) {
        replyMessage = `Added **playlist** [${playlistTitle}](${playlistUri}) (${trackCount} tracks) to the queue.`
      }
      await interaction.reply(replyMessage)

    } else { // TRACK_LOADED or SEARCH_RESULT
      const track = res.tracks[0]
      player.queue.add(track)
      await interaction.reply(`Added [${track.info.title}](${track.info.uri}) to the queue.`)
    }

    // Start playback if not already playing
    if (!player.playing && !player.paused) {
      await player.play()
    }

    // Use imported function
    await updateControlMessage(client, guild.id)
    */
  },
}
