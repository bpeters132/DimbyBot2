import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  type ButtonInteraction,
} from "discord.js"
import type { ChatInputCommandInteraction } from "discord.js"
import type BotClient from "../../lib/BotClient.js"
import { guildMemberFromInteraction } from "../../util/guildMember.js"
import { formatDuration } from "../../util/formatDuration.js"

export default {
  data: new SlashCommandBuilder()
    .setName("queue")
    .setDescription("Get the current queue (paginated)"),
  /** Paginated view of the current track and queue. */
  async execute(interaction: ChatInputCommandInteraction, client: BotClient): Promise<unknown> {
    const guild = interaction.guild
    if (!guild) {
      return interaction.reply({ content: "Use this command in a server." })
    }
    const member = guildMemberFromInteraction(interaction)
    if (!member) {
      return interaction.reply({ content: "Could not resolve your member profile. Try again." })
    }

    // Pre-computation checks
    const voiceChannel = member.voice.channel
    if (!voiceChannel) {
      // User must be in a voice channel
      return interaction.reply({ content: "Join a voice channel first!" })
    }

    const player = client.lavalink.players.get(guild.id)
    if (!player || (!player.queue.current && player.queue.tracks.length === 0)) {
      // Player must exist and have something playing or queued
      return interaction.reply({ content: "Nothing is playing." })
    }

    // Queue data and pagination setup
    const tracks = player.queue.tracks
    const itemsPerPage = 10 // Number of tracks per page
    const totalPages = Math.ceil(tracks.length / itemsPerPage) || 1 // Calculate total pages, default to 1 if empty
    let currentPage = 1 // Start at page 1

    /**
     * Calculates the total duration of the current track and all tracks in the queue.
     * @returns {string} Formatted total duration string.
     */
    const calculateTotalDuration = () => {
      let totalDurationMs = player.queue.current ? (player.queue.current.info.duration ?? 0) : 0
      totalDurationMs += tracks.reduce((acc, track) => acc + (track.info.duration ?? 0), 0)
      return formatDuration(totalDurationMs)
    }

    // Calculate total duration once
    const totalDuration = calculateTotalDuration()

    /**
     * Generates the embed for a specific page of the queue.
     * @param {number} page The page number to generate the embed for.
     * @returns {EmbedBuilder} The generated embed.
     */
    const generateEmbed = (page: number) => {
      const start = (page - 1) * itemsPerPage // Calculate start index for the page
      const end = start + itemsPerPage // Calculate end index for the page
      const currentTracks = tracks.slice(start, end) // Get tracks for the current page

      const embed = new EmbedBuilder()
        .setColor(0x0099ff)
        .setTitle("Queue")
        .setDescription(
          // Display currently playing track information
          `**Now Playing:**\n[${player.queue.current?.info.title || "Nothing"}](${
            player.queue.current?.info.uri || "#"
          }) - \`${formatDuration(player.queue.current?.info.duration || 0)}\`\n\n` +
            // Display the pre-calculated total queue duration
            `**Total Queue Duration:** \`${totalDuration}\``
        )
        .setTimestamp()
        .setFooter({ text: `Page ${page}/${totalPages}` })

      // Add the list of upcoming tracks for the current page
      if (currentTracks.length > 0) {
        let fieldValue = currentTracks // Make fieldValue mutable
          .map(
            (track, index) =>
              `**${start + index + 1}.** [${track.info.title}](${track.info.uri}) - \`${formatDuration(track.info.duration ?? 0)}\``
          )
          .join("\n") || "_No tracks on this page._" // Ensure value is never empty

        // Ensure the field value does not exceed Discord's limit (1024 chars)
        if (fieldValue.length > 1024) {
          fieldValue = fieldValue.substring(0, 1021) + "..." // Truncate and add ellipsis
        }

        embed.addFields([{
          name: "Up Next",
          value: fieldValue,
        }])
      } else if (page === 1) {
        // Special case: If it's the first page and the queue (excluding now playing) is empty
        embed.addFields([{ name: "Up Next", value: "_Queue is empty._" }])
      }

      return embed
    }

    /**
     * Generates the action row with pagination buttons.
     * @param {number} page The current page number.
     * @returns {ActionRowBuilder<ButtonBuilder>} The action row with buttons.
     */
    const generateButtons = (page: number) => {
      return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("prev_page")
          .setLabel("Previous")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(page === 1), // Disable previous button on first page
        new ButtonBuilder()
          .setCustomId("next_page")
          .setLabel("Next")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(page === totalPages) // Disable next button on last page
      )
    }
    
    // Generate initial embed and buttons for the first page
    const initialEmbed = generateEmbed(currentPage)
    const initialButtons = generateButtons(currentPage)

    // Send the initial reply with the embed and buttons
    const message = await interaction.reply({
      embeds: [initialEmbed],
      components: [initialButtons],
      fetchReply: true, // Crucial to get the Message object for the collector
    })

    // Create a collector to listen for button interactions on the reply message
    const collector = message.createMessageComponentCollector({
      componentType: ComponentType.Button, // Only listen to button interactions
      time: 60000, // Collector active for 60 seconds
      // Filter: Only accept interactions from the original command user
      filter: (i: ButtonInteraction) => i.user.id === interaction.user.id,
    })

    // Handle collected button interactions
    collector.on("collect", async (i) => {
      // Acknowledge the button click visually without sending a new message
      await i.deferUpdate()

      // Update the current page based on which button was clicked
      if (i.customId === "prev_page") {
        currentPage--
      } else if (i.customId === "next_page") {
        currentPage++
      }

      // Regenerate the embed and buttons for the new page
      const updatedEmbed = generateEmbed(currentPage)
      const updatedButtons = generateButtons(currentPage)

      // Edit the original reply message with the updated content
      await interaction.editReply({ embeds: [updatedEmbed], components: [updatedButtons] })
    })

    // Handle the end of the collection (e.g., timeout)
    collector.on("end", async (collected, reason) => {
      // Check if the collector ended due to timeout
      if (reason === "time") {
        // Fetch the current state of the embed
        const finalEmbed = generateEmbed(currentPage)
        const disabledButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId("prev_page")
            .setLabel("Previous")
            .setStyle(ButtonStyle.Primary)
            .setDisabled(true),
          new ButtonBuilder()
            .setCustomId("next_page")
            .setLabel("Next")
            .setStyle(ButtonStyle.Primary)
            .setDisabled(true)
        )
        // Attempt to edit the message to show disabled buttons
        try {
          await interaction.editReply({ embeds: [finalEmbed], components: [disabledButtons] })
        } catch (error: unknown) {
          client.error("Queue command: Failed to edit reply after collector end:", error)
        }
      }
    })
  },
}
