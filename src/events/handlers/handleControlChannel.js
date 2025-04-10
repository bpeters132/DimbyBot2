import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField,
} from "discord.js"
import { getGuildSettings, ensureStorageDir } from "../../util/saveControlChannel.js"

/**
 * Formats milliseconds into HH:MM:SS or MM:SS string.
 * @param {number} milliseconds Duration in milliseconds.
 * @returns {string} Formatted duration string.
 */
function formatDuration(milliseconds) {
  if (milliseconds === undefined || milliseconds === null) return "00:00"
  const seconds = Math.floor(milliseconds / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  const displaySeconds = String(seconds % 60).padStart(2, "0")
  const displayMinutes = String(minutes % 60).padStart(2, "0")

  if (hours > 0) {
    return `${hours}:${displayMinutes}:${displaySeconds}`
  }
  return `${displayMinutes}:${displaySeconds}`
}

/**
 * Creates the embed for the player control message.
 * @param {import("../../lib/BotClient").default} client The bot client instance for logging.
 * @param {import("@lavaclient/queue").QueuePlayer | null} player The player instance.
 * @returns {EmbedBuilder} The created embed.
 */
export function createControlEmbed(client, player) {
  client.debug(
    `[ControlHandler] Creating control embed. Player state: ${player ? `Playing: ${player.playing}, Current: ${!!player.queue?.current}, Queue Size: ${player.queue?.size}` : "null"}`
  )
  const embed = new EmbedBuilder()
    .setColor(player && player.playing ? 0x00ff00 : 0xff0000)
    .setTitle("Player Controls")
    .setFooter({ text: "Send a song link or search query to add to the queue." })
    .setTimestamp()

  if (player && player.queue && player.queue.current) {
    const currentTrack = player.queue.current
    embed
      .setDescription(`**Now Playing:** [${currentTrack.info.title}](${currentTrack.info.uri})`)
      .addFields(
        {
          name: "Duration",
          value: currentTrack.info.isStream ? "LIVE" : `${formatDuration(currentTrack.info.duration)}`,
          inline: true,
        },
        { name: "Queue", value: `${player.queue.tracks.length} songs`, inline: true },
        { name: "Status", value: player.playing ? "Playing" : "Paused", inline: true },
        { name: "Loop", value: player.loop ? player.loop.toUpperCase() : 'NONE', inline: true }
      )
    if (currentTrack.requester) {
      embed.addFields({
        name: "Requested by",
        value: `<@${currentTrack.requester.id}>`,
        inline: true,
      })
    }
    if (currentTrack.info.thumbnail) {
      embed.setThumbnail(currentTrack.info.thumbnail)
    }
  } else {
    embed.setDescription("Nothing playing. Add a song!")
    embed.addFields(
      { name: "Queue", value: "Empty", inline: true },
      { name: "Status", value: "Idle", inline: true },
      { name: "Loop", value: "Off", inline: true }
    )
  }

  client.debug(
    `[ControlHandler] Control embed created. Description: ${embed.data.description?.substring(0, 50)}...`
  )
  return embed
}

/**
 * Creates the action row with buttons for the player control message.
 * @param {import("../../lib/BotClient").default} client The bot client instance for logging.
 * @param {import("@lavaclient/queue").QueuePlayer | null} player The player instance.
 * @returns {ActionRowBuilder<ButtonBuilder>} The created action row.
 */
// Pass client for logging
export function createControlButtons(client, player) {
  client.debug(
    `[ControlHandler] Creating control buttons. Player state: ${player ? `Playing: ${player.playing}, Current: ${!!player.queue?.current}, Queue Size: ${player.queue?.size}` : "null"}`
  )
  const isPlaying = player && player.playing
  const hasCurrent = player && player.queue && player.queue.current
  const hasQueue = player && player.queue && player.queue.size > 0

  const playPauseButton = new ButtonBuilder()
    .setCustomId("control_play_pause")
    .setLabel(isPlaying ? "Pause" : "Play")
    .setStyle(isPlaying ? ButtonStyle.Secondary : ButtonStyle.Primary)
    .setDisabled(!hasCurrent)

  const stopButton = new ButtonBuilder()
    .setCustomId("control_stop")
    .setLabel("Stop")
    .setStyle(ButtonStyle.Danger)
    .setDisabled(!hasCurrent)

  const skipButton = new ButtonBuilder()
    .setCustomId("control_skip")
    .setLabel("Skip")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(!hasCurrent)

  const shuffleButton = new ButtonBuilder()
    .setCustomId("control_shuffle")
    .setLabel("Shuffle")
    .setStyle(ButtonStyle.Secondary)
    .setEmoji("🔀")
    .setDisabled(!hasCurrent && !hasQueue)

  const loopButton = new ButtonBuilder()
    .setCustomId("control_loop")
    .setLabel("Loop")
    .setStyle(ButtonStyle.Secondary)
    .setEmoji("🔁")
    .setDisabled(!hasCurrent && !hasQueue)

  const row = new ActionRowBuilder().addComponents(
    playPauseButton,
    stopButton,
    skipButton,
    shuffleButton,
    loopButton
  )
  console.debug(
    `[guildSettings] Control buttons created. Button labels: ${row.components.map((c) => c.data.label).join(", ")}`
  )
  return row
}

/**
 * Cleans up messages in the control channel, leaving only the main control message.
 * @param {import('discord.js').TextChannel} channel The control text channel.
 * @param {string} controlMessageId The ID of the message that should NOT be deleted.
 * @param {import('../lib/BotClient.js').default} client The bot client for logging.
 */
async function cleanupControlChannel(channel, controlMessageId, client) {
  if (!channel) return
  client.debug(`[ControlCleanup] Starting cleanup for channel ${channel.id}`)

  // Check for ManageMessages permission first
  const botPermissions = channel.permissionsFor(client.user)
  if (!botPermissions?.has(PermissionsBitField.Flags.ManageMessages)) {
    client.warn(
      `[ControlCleanup] Missing ManageMessages permission in channel ${channel.id}. Cannot cleanup.`
    )
    return
  }

  try {
    // Fetch recent messages (limit 15-20 is usually sufficient)
    const messages = await channel.messages.fetch({ limit: 15 })
    if (messages.size <= 1) {
      client.debug(
        `[ControlCleanup] No messages to clean (or only control message found) in channel ${channel.id}.`
      )
      return // Nothing to delete besides potentially the control message itself
    }

    // Filter out the main control message
    const messagesToDelete = messages.filter((msg) => msg.id !== controlMessageId)

    if (messagesToDelete.size > 0) {
      client.debug(
        `[ControlCleanup] Found ${messagesToDelete.size} messages to delete in channel ${channel.id}.`
      )
      client.debug("[ControlCleanup] Waiting 5 seconds before deleting...")
      await setTimeout(5000) // Add 5-second delay
      // Bulk delete messages. discord.js handles filtering out messages older than 14 days automatically.
      await channel.bulkDelete(messagesToDelete, true) // true ignores messages older than 14 days
      client.debug(
        `[ControlCleanup] Successfully deleted ${messagesToDelete.size} messages in channel ${channel.id}.`
      )
    } else {
      client.debug(
        `[ControlCleanup] No extraneous messages found to delete in channel ${channel.id}.`
      )
    }
  } catch (error) {
    // Log errors, potentially common if messages are very old or other issues occur
    client.error(
      `[ControlCleanup] Error during control channel cleanup for channel ${channel.id}:`,
      error
    )
  }
}

/**
 * Updates the persistent control message for a guild and cleans up the channel.
 * Fetches player state, channel, and message based on stored settings.
 * @param {import('../../lib/BotClient.js').default} client The bot client.
 * @param {string} guildId The ID of the guild.
 */
export async function updateControlMessage(client, guildId) {
  client.debug(`[ControlHandler] Attempting to update control message for guild ${guildId}`)
  const guildSettings = getGuildSettings()
  const settings = guildSettings[guildId]

  if (!settings || !settings.controlChannelId || !settings.controlMessageId) {
    client.debug(
      `[ControlHandler] No control channel/message configured for guild ${guildId}, skipping update.`
    )
    return
  }
  client.debug(
    `[ControlHandler] Found settings for guild ${guildId}: Channel ${settings.controlChannelId}, Message ${settings.controlMessageId}`
  )

  let controlChannel = null

  try {
    ensureStorageDir()
    controlChannel = await client.channels.fetch(settings.controlChannelId).catch(() => null)
    if (!controlChannel || !controlChannel.isTextBased()) {
      client.warn(
        `[ControlHandler] Control channel ${settings.controlChannelId} not found or not text-based for guild ${guildId}. Cannot update message.`
      )
      return
    }
    client.debug(
      `[ControlHandler] Fetched control channel ${controlChannel.id} for guild ${guildId}`
    )

    const controlMessage = await controlChannel.messages
      .fetch(settings.controlMessageId)
      .catch(() => null)
    if (!controlMessage) {
      client.warn(
        `[ControlHandler] Control message ${settings.controlMessageId} not found in channel ${controlChannel.id} for guild ${guildId}. Cannot update message.`
      )
      return
    }
    client.debug(
      `[ControlHandler] Fetched control message ${controlMessage.id} for guild ${guildId}`
    )

    const player = client.lavalink?.getPlayer(guildId)
    client.debug(
      `[ControlHandler] Fetched player state for guild ${guildId}: ${player ? "Exists" : "null"}`
    )

    const updatedEmbed = createControlEmbed(client, player)
    const updatedButtons = createControlButtons(client, player)

    await controlMessage.edit({ embeds: [updatedEmbed], components: [updatedButtons] })
    client.debug(
      `[ControlHandler] Successfully edited control message ${controlMessage.id} in guild ${guildId}`
    )

    await cleanupControlChannel(controlChannel, controlMessage.id, client)
  } catch (error) {
    if (error.code === 50001 || error.code === 10008 || error.code === 50013) {
      client.warn(
        `[ControlHandler] Failed to update control message for guild ${guildId} (Code: ${error.code}). Might be missing permissions or message/channel deleted.`
      )
    } else {
      client.error(`[ControlHandler] Failed to update control message for guild ${guildId}:`, error)
    }
  }
}
