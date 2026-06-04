import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType,
    EmbedBuilder,
    type ChatInputCommandInteraction,
    type GuildTextBasedChannel,
} from "discord.js"
import type BotClient from "../../lib/BotClient.js"
import { buildCountdownEmbed } from "../../util/countdownEmbed.js"
import { formatCountdownDuration } from "../../util/formatCountdownDuration.js"
import { parseEventDateTime } from "../../util/parseEventDateTime.js"
import {
    addCountdown,
    getCountdown,
    getCountdownsForGuild,
    removeCountdown,
} from "../../util/countdownStore.js"

/** Validates that a string is an http(s) URL usable as an embed image. */
function isValidHttpUrl(value: string): boolean {
    let parsed: URL
    try {
        parsed = new URL(value)
    } catch {
        return false
    }
    return parsed.protocol === "http:" || parsed.protocol === "https:"
}

const REQUIRED_CHANNEL_PERMS = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
]

export default {
    data: new SlashCommandBuilder()
        .setName("countdown")
        .setDescription("Manage auto-updating countdown messages.")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false)
        .addSubcommand((sub) =>
            sub
                .setName("create")
                .setDescription("Create a countdown that updates every minute.")
                .addStringOption((opt) =>
                    opt
                        .setName("event_name")
                        .setDescription("Name of the event to count down to")
                        .setRequired(true)
                )
                .addStringOption((opt) =>
                    opt
                        .setName("date")
                        .setDescription("Target date as YYYY-MM-DD (use with time)")
                        .setRequired(false)
                )
                .addStringOption((opt) =>
                    opt
                        .setName("time")
                        .setDescription("Target time as 24-hour HH:MM (use with date)")
                        .setRequired(false)
                )
                .addStringOption((opt) =>
                    opt
                        .setName("timezone")
                        .setDescription("Time zone for date/time (defaults to UTC)")
                        .setRequired(false)
                        .addChoices(
                            { name: "UTC", value: "UTC" },
                            { name: "US Eastern", value: "America/New_York" },
                            { name: "US Central", value: "America/Chicago" },
                            { name: "US Mountain", value: "America/Denver" },
                            { name: "US Pacific", value: "America/Los_Angeles" },
                            { name: "US Alaska", value: "America/Anchorage" },
                            { name: "US Hawaii", value: "Pacific/Honolulu" },
                            { name: "UK (London)", value: "Europe/London" },
                            { name: "Central Europe (Paris)", value: "Europe/Paris" },
                            { name: "Eastern Europe (Athens)", value: "Europe/Athens" },
                            { name: "India (Kolkata)", value: "Asia/Kolkata" },
                            { name: "China (Shanghai)", value: "Asia/Shanghai" },
                            { name: "Japan (Tokyo)", value: "Asia/Tokyo" },
                            { name: "Australia (Sydney)", value: "Australia/Sydney" }
                        )
                )
                .addIntegerOption((opt) =>
                    opt
                        .setName("timestamp")
                        .setDescription("Advanced: target time as a Unix timestamp in seconds")
                        .setRequired(false)
                        .setMinValue(1)
                )
                .addChannelOption((opt) =>
                    opt
                        .setName("channel")
                        .setDescription("Channel to post in (defaults to the current channel)")
                        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                        .setRequired(false)
                )
                .addStringOption((opt) =>
                    opt
                        .setName("description")
                        .setDescription("Optional description shown in the embed")
                        .setRequired(false)
                )
                .addStringOption((opt) =>
                    opt
                        .setName("image_url")
                        .setDescription("Optional image URL (http/https) shown in the embed")
                        .setRequired(false)
                )
                .addIntegerOption((opt) =>
                    opt
                        .setName("color")
                        .setDescription("Optional embed accent color")
                        .setRequired(false)
                        .addChoices(
                            { name: "Blurple", value: 0x5865f2 },
                            { name: "Red", value: 0xed4245 },
                            { name: "Green", value: 0x57f287 },
                            { name: "Blue", value: 0x3498db },
                            { name: "Yellow", value: 0xfee75c },
                            { name: "Orange", value: 0xe67e22 },
                            { name: "Purple", value: 0x9b59b6 },
                            { name: "Pink", value: 0xeb459e },
                            { name: "White", value: 0xffffff },
                            { name: "Black", value: 0x2b2d31 }
                        )
                )
                .addStringOption((opt) =>
                    opt
                        .setName("footer")
                        .setDescription(
                            "Optional custom footer text (defaults to the countdown id)"
                        )
                        .setRequired(false)
                        .setMaxLength(256)
                )
        )
        .addSubcommand((sub) =>
            sub.setName("list").setDescription("List active countdowns in this server.")
        )
        .addSubcommand((sub) =>
            sub
                .setName("delete")
                .setDescription("Delete a countdown by id.")
                .addIntegerOption((opt) =>
                    opt
                        .setName("countdown_id")
                        .setDescription("Countdown id (see /countdown list)")
                        .setRequired(true)
                        .setMinValue(1)
                )
        ),
    category: "admin",

    async execute(interaction: ChatInputCommandInteraction, client: BotClient): Promise<unknown> {
        if (!interaction.inGuild() || !interaction.guild) {
            return interaction.reply({ content: "Use this command in a server.", ephemeral: true })
        }
        const guild = interaction.guild
        const subcommand = interaction.options.getSubcommand()

        try {
            if (subcommand === "create") {
                return await handleCreate(interaction, client, guild.id)
            }
            if (subcommand === "list") {
                return await handleList(interaction, guild.id)
            }
            if (subcommand === "delete") {
                return await handleDelete(interaction, client, guild.id)
            }
            return interaction.reply({ content: "Unknown subcommand.", ephemeral: true })
        } catch (err: unknown) {
            client.error("[Countdown command] execute failed:", err)
            const content = "An error occurred while processing your request."
            if (interaction.deferred || interaction.replied) {
                return interaction.editReply({ content })
            }
            return interaction.reply({ content, ephemeral: true })
        }
    },
}

async function handleCreate(
    interaction: ChatInputCommandInteraction,
    client: BotClient,
    guildId: string
): Promise<unknown> {
    await interaction.deferReply({ ephemeral: true })

    const eventName = interaction.options.getString("event_name", true)
    const date = interaction.options.getString("date")
    const time = interaction.options.getString("time")
    const timezone = interaction.options.getString("timezone") ?? "UTC"
    const timestamp = interaction.options.getInteger("timestamp")
    const description = interaction.options.getString("description")
    const imageUrl = interaction.options.getString("image_url")
    const color = interaction.options.getInteger("color")
    const footer = interaction.options.getString("footer")

    let targetMs: number
    if (date || time) {
        if (!date || !time) {
            return interaction.editReply({
                content: "Provide both `date` and `time` together (or use `timestamp` instead).",
            })
        }
        const parsed = parseEventDateTime(date, time, timezone)
        if (parsed.ok === false) {
            return interaction.editReply({ content: parsed.error })
        }
        targetMs = parsed.epochSeconds * 1000
    } else if (timestamp !== null) {
        targetMs = timestamp * 1000
    } else {
        return interaction.editReply({
            content: "Provide a target time: either `date` + `time`, or a Unix `timestamp`.",
        })
    }

    if (targetMs <= Date.now()) {
        return interaction.editReply({
            content: "The target time must be in the future.",
        })
    }

    if (imageUrl && !isValidHttpUrl(imageUrl)) {
        return interaction.editReply({
            content: "The image URL must be a valid http or https URL.",
        })
    }

    const channelId = interaction.options.getChannel("channel")?.id ?? interaction.channelId
    const resolved = await client.channels.fetch(channelId).catch((): null => null)
    if (!resolved || !resolved.isTextBased() || resolved.isDMBased() || !("send" in resolved)) {
        return interaction.editReply({
            content: "The target channel must be a text channel in this server.",
        })
    }
    const targetChannel = resolved as GuildTextBasedChannel

    const botUser = client.user
    if (!botUser) {
        return interaction.editReply({ content: "Bot user is not available yet. Try again." })
    }
    const botPermissions = targetChannel.permissionsFor(botUser)
    if (!botPermissions?.has(REQUIRED_CHANNEL_PERMS)) {
        return interaction.editReply({
            content:
                "I need View Channel, Send Messages, and Embed Links permissions in the target channel.",
        })
    }

    const placeholder = await targetChannel
        .send({ content: "Setting up countdown..." })
        .catch((): null => null)
    if (!placeholder) {
        return interaction.editReply({
            content: "Failed to post the countdown message. Check my permissions in that channel.",
        })
    }

    let entry
    try {
        entry = await addCountdown({
            guildId,
            channelId: targetChannel.id,
            messageId: placeholder.id,
            eventName,
            description: description ?? null,
            imageUrl: imageUrl ?? null,
            color: color ?? null,
            footer: footer ?? null,
            targetTime: new Date(targetMs),
            createdBy: interaction.user.id,
        })
    } catch (err: unknown) {
        await placeholder.delete().catch((rollbackErr: unknown) => {
            client.warn(
                `[Countdown] Failed to roll back placeholder message ${placeholder.id} after save failure:`,
                rollbackErr
            )
        })
        throw err
    }

    await placeholder.edit({ content: null, embeds: [buildCountdownEmbed(entry)] })

    return interaction.editReply({
        content: `Created countdown **#${entry.id}** for **${eventName}** in ${targetChannel}.`,
    })
}

async function handleList(
    interaction: ChatInputCommandInteraction,
    guildId: string
): Promise<unknown> {
    await interaction.deferReply({ ephemeral: true })

    const countdowns = getCountdownsForGuild(guildId).sort(
        (a, b) => a.targetTime.getTime() - b.targetTime.getTime()
    )
    if (countdowns.length === 0) {
        return interaction.editReply({
            content: "No active countdowns in this server. Use `/countdown create` to add one.",
        })
    }

    const now = Date.now()
    const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("Active Countdowns")
        .setDescription(
            countdowns
                .map((c) => {
                    const remaining = c.targetTime.getTime() - now
                    const remainingText =
                        remaining <= 0 ? "Event started!" : formatCountdownDuration(remaining)
                    return `**#${c.id}** — ${c.eventName}\n<#${c.channelId}> • ${remainingText}`
                })
                .join("\n\n")
        )
        .setTimestamp()

    return interaction.editReply({ embeds: [embed] })
}

async function handleDelete(
    interaction: ChatInputCommandInteraction,
    client: BotClient,
    guildId: string
): Promise<unknown> {
    await interaction.deferReply({ ephemeral: true })

    const id = interaction.options.getInteger("countdown_id", true)
    const entry = getCountdown(id)
    if (!entry || entry.guildId !== guildId) {
        return interaction.editReply({
            content: `No countdown **#${id}** found in this server.`,
        })
    }

    const channel = await client.channels.fetch(entry.channelId).catch((): null => null)
    if (channel && "messages" in channel) {
        const message = await channel.messages.fetch(entry.messageId).catch((): null => null)
        if (message) {
            await message.delete().catch((err: unknown) => {
                client.warn(
                    `[Countdown] Failed to delete message ${entry.messageId} for countdown #${id}:`,
                    err
                )
            })
        }
    }

    await removeCountdown(id)

    return interaction.editReply({ content: `Deleted countdown **#${id}** (${entry.eventName}).` })
}
