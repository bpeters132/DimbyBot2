import {
    ChannelType,
    EmbedBuilder,
    MessageFlags,
    PermissionFlagsBits,
    SlashCommandBuilder,
    type AutocompleteInteraction,
    type ChatInputCommandInteraction,
    type GuildTextBasedChannel,
    type SlashCommandSubcommandBuilder,
} from "discord.js"
import type BotClient from "../../lib/BotClient.js"
import type { UploadEventType } from "../../types/index.js"
import {
    addYoutubeAlert,
    getYoutubeAlert,
    getYoutubeAlertsForGuild,
    getYoutubeWatch,
    removeYoutubeAlert,
    updateYoutubeAlert,
} from "../../util/youtubeAlertStore.js"
import {
    parseYoutubeChannelInput,
    resolveYoutubeChannel,
} from "../../util/youtubeChannelResolve.js"
import {
    seedYoutubeWatchBacklog,
    seedYoutubeWatchSeenFromCommunity,
    subscribeYoutubeChannelPubsub,
    unsubscribeYoutubeChannelPubsub,
} from "../../util/youtubeUploadMonitor.js"
import { ALL_UPLOAD_EVENT_TYPES } from "../../util/uploadEventType.js"

const REQUIRED_CHANNEL_PERMS = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
]

const TYPE_OPTION_NAMES = ["video", "short", "premiere", "live", "community"] as const

function collectRoles(interaction: ChatInputCommandInteraction): string[] {
    const ids: string[] = []
    for (const name of ["role", "role2", "role3", "role4", "role5"] as const) {
        const role = interaction.options.getRole(name)
        if (role && !ids.includes(role.id)) ids.push(role.id)
    }
    return ids
}

function collectEventTypes(interaction: ChatInputCommandInteraction): UploadEventType[] | null {
    const provided: { type: UploadEventType; value: boolean }[] = []
    for (const name of TYPE_OPTION_NAMES) {
        const value = interaction.options.getBoolean(name)
        if (value !== null) provided.push({ type: name, value })
    }
    if (provided.length === 0) return [...ALL_UPLOAD_EVENT_TYPES]
    const selected = provided.filter((row) => row.value).map((row) => row.type)
    return selected.length > 0 ? selected : null
}

function addTypeOptionFlags(sub: SlashCommandSubcommandBuilder): SlashCommandSubcommandBuilder {
    const descriptions: Record<(typeof TYPE_OPTION_NAMES)[number], string> = {
        video: "Match regular videos",
        short: "Match Shorts",
        premiere: "Match premieres when they become watchable",
        live: "Match livestream starts",
        community: "Match Community posts",
    }
    for (const name of TYPE_OPTION_NAMES) {
        sub.addBooleanOption((opt) =>
            opt.setName(name).setDescription(descriptions[name]).setRequired(false)
        )
    }
    return sub
}

function addRoleOptions(sub: SlashCommandSubcommandBuilder): SlashCommandSubcommandBuilder {
    const names = [
        ["role", "Role to mention"],
        ["role2", "Second role to mention"],
        ["role3", "Third role to mention"],
        ["role4", "Fourth role to mention"],
        ["role5", "Fifth role to mention"],
    ] as const
    for (const [name, description] of names) {
        sub.addRoleOption((opt) => opt.setName(name).setDescription(description).setRequired(false))
    }
    return sub
}

function formatTypes(types: UploadEventType[]): string {
    return types.join(", ")
}

function formatRoles(ids: string[]): string {
    return ids.length > 0 ? ids.map((id) => `<@&${id}>`).join(" ") : "none"
}

async function assertPostableChannel(
    interaction: ChatInputCommandInteraction,
    client: BotClient,
    channel: GuildTextBasedChannel
): Promise<boolean> {
    const me = interaction.guild?.members.me
    if (me && !channel.permissionsFor(me)?.has(REQUIRED_CHANNEL_PERMS)) {
        await interaction.editReply({
            content: `I need View Channel, Send Messages, and Embed Links in ${channel}.`,
        })
        return false
    }
    client.debug(`[yt-alerts] Channel ${channel.id} is postable.`)
    return true
}

async function handleAdd(
    interaction: ChatInputCommandInteraction,
    client: BotClient,
    guildId: string
): Promise<unknown> {
    const youtube = interaction.options.getString("youtube", true)
    const parsed = parseYoutubeChannelInput(youtube)
    if (parsed.kind === "invalid") {
        return interaction.editReply({ content: parsed.reason })
    }
    const channel = interaction.options.getChannel("channel", true)
    if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) {
        return interaction.editReply({
            content: "Pick a server text or announcement channel.",
        })
    }
    const types = collectEventTypes(interaction)
    if (!types) {
        return interaction.editReply({
            content:
                "Turn on at least one event type, or omit all type options to match everything.",
        })
    }
    const postChannel = channel as GuildTextBasedChannel
    if (!(await assertPostableChannel(interaction, client, postChannel))) return

    let identity
    try {
        identity = await resolveYoutubeChannel(youtube)
    } catch (error: unknown) {
        client.warn("[yt-alerts] Failed to resolve YouTube channel:", error)
        return interaction.editReply({
            content: "Could not reach YouTube to resolve that channel. Try again in a moment.",
        })
    }
    if (!identity) {
        return interaction.editReply({
            content:
                "Could not resolve that YouTube channel. Use a channel URL, @handle, or UC… id.",
        })
    }

    const created = await addYoutubeAlert({
        guildId,
        youtubeChannelId: identity.channelId,
        youtubeChannelName: identity.displayName,
        discordChannelId: postChannel.id,
        mentionRoleIds: collectRoles(interaction),
        messageTemplate: interaction.options.getString("message"),
        eventTypes: types,
        createdBy: interaction.user.id,
    })

    if (created.createdWatch) {
        try {
            const seeded = await seedYoutubeWatchBacklog(created.watch)
            client.info(
                `[yt-alerts] Seeded Watch #${created.watch.id} (${identity.channelId}): rss=${seeded.rss}, community=${seeded.community}.`
            )
            await subscribeYoutubeChannelPubsub(identity.channelId, client)
        } catch (error: unknown) {
            client.warn("[yt-alerts] Failed to seed RSS; rolling back new Watch:", error)
            await removeYoutubeAlert(created.alert.id)
            return interaction.editReply({
                content:
                    "Created the Alert but could not snapshot the channel’s current videos. Try again.",
            })
        }
    } else if (types.includes("community")) {
        // Existing Watch may predate community seeding; snapshot posts before the first community poll.
        try {
            await seedYoutubeWatchSeenFromCommunity(created.watch)
        } catch (error: unknown) {
            client.warn("[yt-alerts] Failed to seed community posts for existing Watch:", error)
        }
    }

    return interaction.editReply({
        content:
            `Added Upload Alert **#${created.alert.id}** for **${identity.displayName}** in ${postChannel}.\n` +
            `Types: ${formatTypes(created.alert.eventTypes)}\n` +
            `Mentions: ${formatRoles(created.alert.mentionRoleIds)}` +
            (created.createdWatch
                ? "\nStarted an Upload Watch for this creator (existing videos will not be announced)."
                : "\nAttached to the existing Upload Watch for this creator."),
    })
}

async function handleList(
    interaction: ChatInputCommandInteraction,
    guildId: string
): Promise<unknown> {
    const rows = getYoutubeAlertsForGuild(guildId)
    if (rows.length === 0) {
        return interaction.editReply({
            content: "No Upload Alerts in this server. Use `/yt-alerts add` to create one.",
        })
    }
    const byWatch = new Map<number, typeof rows>()
    for (const row of rows) {
        const list = byWatch.get(row.watch.id) ?? []
        list.push(row)
        byWatch.set(row.watch.id, list)
    }
    const lines: string[] = []
    for (const group of byWatch.values()) {
        const watch = group[0].watch
        lines.push(`**${watch.youtubeChannelName}** \`${watch.youtubeChannelId}\``)
        for (const { alert } of group) {
            lines.push(
                `• Alert **#${alert.id}** → <#${alert.discordChannelId}> · ${formatTypes(alert.eventTypes)} · mentions: ${formatRoles(alert.mentionRoleIds)}`
            )
        }
    }
    let description = lines.join("\n")
    if (description.length > 3900) {
        description = `${description.slice(0, 3900)}\n…`
    }
    return interaction.editReply({
        embeds: [new EmbedBuilder().setTitle("Upload Alerts").setDescription(description)],
    })
}

async function handleRemove(
    interaction: ChatInputCommandInteraction,
    client: BotClient,
    guildId: string
): Promise<unknown> {
    const id = interaction.options.getInteger("alert_id", true)
    const existing = getYoutubeAlert(id)
    const watch = existing ? getYoutubeWatch(existing.watchId) : undefined
    if (!existing || !watch || watch.guildId !== guildId) {
        return interaction.editReply({ content: `No Upload Alert **#${id}** in this server.` })
    }
    const removed = await removeYoutubeAlert(id)
    if (!removed) {
        return interaction.editReply({ content: `No Upload Alert **#${id}** in this server.` })
    }
    if (removed.removedWatch) {
        await unsubscribeYoutubeChannelPubsub(removed.removedWatch.youtubeChannelId, client)
    }
    return interaction.editReply({
        content: removed.removedWatch
            ? `Removed Alert **#${id}** and the Upload Watch for **${removed.removedWatch.youtubeChannelName}**.`
            : `Removed Alert **#${id}**.`,
    })
}

async function handleEdit(
    interaction: ChatInputCommandInteraction,
    client: BotClient,
    guildId: string
): Promise<unknown> {
    const id = interaction.options.getInteger("alert_id", true)
    const existing = getYoutubeAlert(id)
    const watch = existing ? getYoutubeWatch(existing.watchId) : undefined
    if (!existing || !watch || watch.guildId !== guildId) {
        return interaction.editReply({ content: `No Upload Alert **#${id}** in this server.` })
    }

    const channel = interaction.options.getChannel("channel")
    if (
        channel &&
        channel.type !== ChannelType.GuildText &&
        channel.type !== ChannelType.GuildAnnouncement
    ) {
        return interaction.editReply({
            content: "Pick a server text or announcement channel.",
        })
    }
    if (channel) {
        if (!(await assertPostableChannel(interaction, client, channel as GuildTextBasedChannel))) {
            return
        }
    }

    const typeFlagsPresent = TYPE_OPTION_NAMES.some(
        (name) => interaction.options.getBoolean(name) !== null
    )
    let eventTypes: UploadEventType[] | undefined
    if (typeFlagsPresent) {
        const types = collectEventTypes(interaction)
        if (!types) {
            return interaction.editReply({
                content:
                    "Turn on at least one event type, or omit all type options to leave them unchanged.",
            })
        }
        eventTypes = types
    }

    const rolesProvided = ["role", "role2", "role3", "role4", "role5"].some(
        (name) => interaction.options.getRole(name) !== null
    )
    const clearRoles = interaction.options.getBoolean("clear_roles") === true

    const updated = await updateYoutubeAlert(id, {
        discordChannelId: channel?.id,
        mentionRoleIds: clearRoles ? [] : rolesProvided ? collectRoles(interaction) : undefined,
        messageTemplate: interaction.options.getString("message") ?? undefined,
        eventTypes,
    })
    if (!updated) {
        return interaction.editReply({ content: `No Upload Alert **#${id}** in this server.` })
    }
    const communityNewlyEnabled =
        eventTypes?.includes("community") === true && !existing.eventTypes.includes("community")
    if (communityNewlyEnabled) {
        try {
            await seedYoutubeWatchSeenFromCommunity(watch)
        } catch (error: unknown) {
            client.warn("[yt-alerts] Failed to seed community posts after edit:", error)
        }
    }
    return interaction.editReply({
        content:
            `Updated Alert **#${updated.id}** for **${watch.youtubeChannelName}**.\n` +
            `Channel: <#${updated.discordChannelId}> · Types: ${formatTypes(updated.eventTypes)} · Mentions: ${formatRoles(updated.mentionRoleIds)}`,
    })
}

async function autocompleteAlertId(interaction: AutocompleteInteraction): Promise<void> {
    const guildId = interaction.guildId
    if (!guildId) {
        await interaction.respond([])
        return
    }
    const focused = interaction.options.getFocused()
    const rows = getYoutubeAlertsForGuild(guildId)
    const filtered = rows
        .filter((row) => {
            const hay = `${row.alert.id} ${row.watch.youtubeChannelName}`.toLowerCase()
            return hay.includes(String(focused).toLowerCase())
        })
        .slice(0, 25)
    await interaction.respond(
        filtered.map((row) => ({
            name: `#${row.alert.id} ${row.watch.youtubeChannelName}`.slice(0, 100),
            value: row.alert.id,
        }))
    )
}

export default {
    data: new SlashCommandBuilder()
        .setName("yt-alerts")
        .setDescription("Notify a channel when a YouTube creator uploads.")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false)
        .addSubcommand((sub) => {
            sub.setName("add")
                .setDescription("Add an Upload Alert (creates the Watch on the first Alert).")
                .addStringOption((opt) =>
                    opt
                        .setName("youtube")
                        .setDescription("Channel URL, @handle, or UC… id")
                        .setRequired(true)
                )
                .addChannelOption((opt) =>
                    opt
                        .setName("channel")
                        .setDescription("Text or announcement channel to post in")
                        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                        .setRequired(true)
                )
                .addStringOption((opt) =>
                    opt
                        .setName("message")
                        .setDescription("Template: {title} {url} {creator} {type} {role}")
                        .setRequired(false)
                        .setMaxLength(1800)
                )
            addTypeOptionFlags(sub)
            addRoleOptions(sub)
            return sub
        })
        .addSubcommand((sub) =>
            sub.setName("list").setDescription("List Upload Alerts grouped by creator.")
        )
        .addSubcommand((sub) =>
            sub
                .setName("remove")
                .setDescription("Remove an Upload Alert (last Alert also removes the Watch).")
                .addIntegerOption((opt) =>
                    opt
                        .setName("alert_id")
                        .setDescription("Alert id (see /yt-alerts list)")
                        .setRequired(true)
                        .setMinValue(1)
                        .setAutocomplete(true)
                )
        )
        .addSubcommand((sub) => {
            sub.setName("edit")
                .setDescription("Edit an Upload Alert.")
                .addIntegerOption((opt) =>
                    opt
                        .setName("alert_id")
                        .setDescription("Alert id (see /yt-alerts list)")
                        .setRequired(true)
                        .setMinValue(1)
                        .setAutocomplete(true)
                )
                .addChannelOption((opt) =>
                    opt
                        .setName("channel")
                        .setDescription("New text or announcement channel")
                        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                        .setRequired(false)
                )
                .addStringOption((opt) =>
                    opt
                        .setName("message")
                        .setDescription("New template ({title} {url} {creator} {type} {role})")
                        .setRequired(false)
                        .setMaxLength(1800)
                )
                .addBooleanOption((opt) =>
                    opt
                        .setName("clear_roles")
                        .setDescription("Remove all role mentions from this Alert")
                        .setRequired(false)
                )
            addTypeOptionFlags(sub)
            addRoleOptions(sub)
            return sub
        }),
    category: "admin",

    async autocomplete(interaction: AutocompleteInteraction): Promise<void> {
        await autocompleteAlertId(interaction)
    },

    async execute(interaction: ChatInputCommandInteraction, client: BotClient): Promise<unknown> {
        if (!interaction.inGuild() || !interaction.guild) {
            return interaction.reply({
                content: "Use this command in a server.",
                flags: [MessageFlags.Ephemeral],
            })
        }
        const subcommand = interaction.options.getSubcommand()
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] })
        if (subcommand === "add") {
            return handleAdd(interaction, client, interaction.guild.id)
        }
        if (subcommand === "list") {
            return handleList(interaction, interaction.guild.id)
        }
        if (subcommand === "remove") {
            return handleRemove(interaction, client, interaction.guild.id)
        }
        if (subcommand === "edit") {
            return handleEdit(interaction, client, interaction.guild.id)
        }
        return interaction.editReply({ content: "Unknown subcommand." })
    },
}
