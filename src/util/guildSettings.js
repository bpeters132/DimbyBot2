import fs from "fs"
import path from "path"
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField } from "discord.js"
import { fileURLToPath } from "url"
import { setTimeout } from 'timers/promises'
import formatDuration from './formatDuration.js' // Import the external function

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const storageDir = path.join(__dirname, "..", "..", "storage")
const settingsFile = path.join(storageDir, "guild_settings.json")

// Pass client for logging
function ensureStorageDir() {
  if (!fs.existsSync(storageDir)) {
    console.debug(`[guildSettings] Storage directory ${storageDir} not found, attempting creation.`)
    try {
      fs.mkdirSync(storageDir, { recursive: true })
      console.log(`[guildSettings] Created storage directory at: ${storageDir}`)
    } catch (error) {
      console.error(`[guildSettings] Error creating storage directory: ${error}`)
    }
  }
}
// ensureStorageDir() // Call this only when client is available

// Pass client for logging and calling ensureStorageDir
export function getGuildSettings() {
  ensureStorageDir() // Pass client
  console.debug(`[guildSettings] Attempting to read settings from: ${settingsFile}`)
  try {
    if (fs.existsSync(settingsFile)) {
      const data = fs.readFileSync(settingsFile, "utf8")
      const parsed = JSON.parse(data)
      if (typeof parsed === "object" && parsed !== null) {
        console.debug(`[guildSettings] Successfully read and parsed settings file.`)
        return parsed
      } else {
        console.warn(`[guildSettings] Parsed settings file is not a valid object.`)
        return {}
      }
    } else {
      console.debug(`[guildSettings] Settings file does not exist.`)
      return {}
    }
  } catch (error) {
    console.error(
      `[guildSettings] Error reading or parsing guild settings from ${settingsFile}: ${error}`
    )
    return {}
  }
}

// Pass client for logging and calling ensureStorageDir
export function saveGuildSettings(settings) {
  ensureStorageDir() // Pass client
  console.debug(`[guildSettings] Attempting to save settings to: ${settingsFile}`)
  try {
    const data = JSON.stringify(settings, null, 4)
    fs.writeFileSync(settingsFile, data, "utf8")
    console.debug(
      `[guildSettings] Successfully saved settings. Data snippet: ${data.substring(0, 100)}...`
    )
  } catch (error) {
    console.error(`[guildSettings] Error writing guild settings to ${settingsFile}: ${error}`)
  }
}

// Pass client for logging
/**
 * Creates a control embed for the player
 * @param {import('lavalink-client').Player} player
 * @returns {import('discord.js').EmbedBuilder}
 * 
 */

 export function createControlEmbed(player) {
  console.debug(
    `[guildSettings] Creating control embed. Player state: ${player ? `Playing: ${player.playing}, Current: ${!!player.queue?.current}, Queue Size: ${player.queue?.size}` : "null"}`
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
  console.debug(
    `[guildSettings] Control embed created. Description: ${embed.data.description?.substring(0, 50)}...`
  )
  return embed
}

// Pass client for logging
export function createControlButtons(player) {
  console.debug(
    `[guildSettings] Creating control buttons. Player state: ${player ? `Playing: ${player.playing}, Current: ${!!player.queue?.current}, Queue Size: ${player.queue?.size}` : "null"}`
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

  const row = new ActionRowBuilder().addComponents(playPauseButton, stopButton, skipButton, shuffleButton, loopButton)
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
        client.warn(`[ControlCleanup] Missing ManageMessages permission in channel ${channel.id}. Cannot cleanup.`)
        return
    }

    try {
        // Fetch recent messages (limit 15-20 is usually sufficient)
        const messages = await channel.messages.fetch({ limit: 15 })
        if (messages.size <= 1) {
             client.debug(`[ControlCleanup] No messages to clean (or only control message found) in channel ${channel.id}.`)
            return // Nothing to delete besides potentially the control message itself
        }

        // Filter out the main control message
        const messagesToDelete = messages.filter(msg => msg.id !== controlMessageId)

        if (messagesToDelete.size > 0) {
            client.debug(`[ControlCleanup] Found ${messagesToDelete.size} messages to delete in channel ${channel.id}.`)
            client.debug('[ControlCleanup] Waiting 5 seconds before deleting...')
            await setTimeout(5000) // Add 5-second delay
            // Bulk delete messages. discord.js handles filtering out messages older than 14 days automatically.
            await channel.bulkDelete(messagesToDelete, true) // true ignores messages older than 14 days
            client.debug(`[ControlCleanup] Successfully deleted ${messagesToDelete.size} messages in channel ${channel.id}.`)
        } else {
            client.debug(`[ControlCleanup] No extraneous messages found to delete in channel ${channel.id}.`)
        }
    } catch (error) {
        // Log errors, potentially common if messages are very old or other issues occur
        client.error(`[ControlCleanup] Error during control channel cleanup for channel ${channel.id}:`, error)
    }
}

/**
 * Updates the persistent control message for a guild and cleans up the channel.
 * Fetches player state, channel, and message based on stored settings.
 * @param {import('../lib/BotClient.js').default} client The bot client.
 * @param {string} guildId The ID of the guild.
 */
export async function updateControlMessage(client, guildId) {
    client.debug(`[guildSettings] Attempting to update control message for guild ${guildId}`)
    const guildSettings = getGuildSettings() // Pass client
    const settings = guildSettings[guildId]

    if (!settings || !settings.controlChannelId || !settings.controlMessageId) {
        client.debug(`[guildSettings] No control channel/message configured for guild ${guildId}, skipping update.`)
        return
    }
    client.debug(`[guildSettings] Found settings for guild ${guildId}: Channel ${settings.controlChannelId}, Message ${settings.controlMessageId}`)

    let controlChannel = null // Define here to use in finally block if needed

    try {
        ensureStorageDir() // Ensure dir exists before fetch attempts
        controlChannel = await client.channels.fetch(settings.controlChannelId).catch(() => null)
        if (!controlChannel || !controlChannel.isTextBased()) { // Check if channel exists and is text-based
            client.warn(`[guildSettings] Control channel ${settings.controlChannelId} not found or not text-based for guild ${guildId}. Cannot update message.`)
            // Consider removing the stale setting from guild_settings.json here
            return
        }
        client.debug(`[guildSettings] Fetched control channel ${controlChannel.id} for guild ${guildId}`)

        const controlMessage = await controlChannel.messages.fetch(settings.controlMessageId).catch(() => null)
        if (!controlMessage) {
            client.warn(`[guildSettings] Control message ${settings.controlMessageId} not found in channel ${controlChannel.id} for guild ${guildId}. Cannot update message.`)
            // Consider removing the stale setting or recreating the message?
            return
        }
         client.debug(`[guildSettings] Fetched control message ${controlMessage.id} for guild ${guildId}`)

        const player = client.lavalink?.getPlayer(guildId)
        client.debug(`[guildSettings] Fetched player state for guild ${guildId}: ${player ? 'Exists' : 'null'}`)

        const updatedEmbed = createControlEmbed(player) // Pass client
        const updatedButtons = createControlButtons(player) // Pass client

        await controlMessage.edit({ embeds: [updatedEmbed], components: [updatedButtons] })
        client.debug(`[guildSettings] Successfully edited control message ${controlMessage.id} in guild ${guildId}`)

        // --- Run Cleanup --- 
        // Optional delay using setTimeout if needed, but running immediately after edit is usually fine
        // setTimeout(() => cleanupControlChannel(controlChannel, controlMessage.id, client), 1000) // Example 1s delay
        // Run cleanup asynchronously (fire and forget) without blocking updateControlMessage
        cleanupControlChannel(controlChannel, controlMessage.id, client).catch(cleanupError => {
            // Log any unhandled error from the cleanup promise itself
            client.error(`[guildSettings] Unhandled error in background cleanupControlChannel for guild ${guildId}:`, cleanupError)
        })
        // --- End Cleanup ---

    } catch (error) {
        if (error.code === 50001 || error.code === 10008 || error.code === 50013) { // Added 50013 Missing Permissions
            client.warn(`[guildSettings] Failed to update control message for guild ${guildId} (Code: ${error.code}). Might be missing permissions or message/channel deleted.`) // Clarified message
        } else {
            client.error(`[guildSettings] Failed to update control message for guild ${guildId}:`, error)
        }
    }
}
