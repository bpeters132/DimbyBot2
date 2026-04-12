import { ChannelType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js"
import type BotClient from "../../lib/BotClient.js"
import type { ChatInputCommandInteraction } from "discord.js"
import type {
    DiscordLogLevelName,
    GuildDiscordLogSettings,
    GuildSettings,
    GuildSettingsStore,
} from "../../types/index.js"
import { discordLogLevelAllowed, resolveDiscordLogChannelId } from "../../util/discordLogForward.js"
import {
    getGuildSettings,
    isGuildSettingsInitialized,
    saveGuildSettings,
} from "../../util/saveControlChannel.js"

const LEVEL_CHOICES: DiscordLogLevelName[] = ["debug", "info", "warn", "error"]

function normalizeDiscordLog(cfg: GuildDiscordLogSettings): GuildDiscordLogSettings | undefined {
    const out: GuildDiscordLogSettings = { ...cfg }
    if (out.byLevel) {
        const entries = Object.entries(out.byLevel).filter(([, id]) => Boolean(id))
        if (entries.length === 0) {
            delete out.byLevel
        } else {
            out.byLevel = Object.fromEntries(entries) as GuildDiscordLogSettings["byLevel"]
        }
    }
    if (!out.allChannelId && !out.byLevel && out.minLevel === undefined) {
        return undefined
    }
    return out
}

/** Writes normalized `next` to `guildRow.discordLog`, or removes the key if empty. */
function applyNormalizedDiscordLog(next: GuildDiscordLogSettings, guildRow: GuildSettings): void {
    const normalized = normalizeDiscordLog(next)
    if (normalized) {
        guildRow.discordLog = normalized
    } else {
        delete guildRow.discordLog
    }
}

/** Copy of `discordLog` safe to mutate without affecting the live settings cache. */
function detachGuildDiscordLog(cfg: GuildDiscordLogSettings | undefined): GuildDiscordLogSettings {
    if (!cfg) {
        return {}
    }
    return {
        ...cfg,
        byLevel: cfg.byLevel ? { ...cfg.byLevel } : undefined,
    }
}

/** Copy of a guild row safe to mutate (detached `discordLog` / `byLevel`). */
function detachGuildRow(row: GuildSettings | undefined): GuildSettings {
    if (!row) {
        return {}
    }
    const out: GuildSettings = { ...row }
    if (row.discordLog) {
        out.discordLog = detachGuildDiscordLog(row.discordLog)
    }
    return out
}

/** New store map with this guild’s row replaced; drops the guild key if `row` is empty. */
function storeWithGuildRow(
    store: GuildSettingsStore,
    guildId: string,
    row: GuildSettings
): GuildSettingsStore {
    const next: GuildSettingsStore = { ...store }
    if (Object.keys(row).length === 0) {
        delete next[guildId]
    } else {
        next[guildId] = row
    }
    return next
}

function formatConfig(cfg: GuildDiscordLogSettings): string {
    const min = cfg.minLevel ?? "debug"
    const lines: string[] = [
        `**Minimum level** (Discord): \`${min}\` — only this severity and higher are considered for forwarding.`,
    ]
    if (cfg.allChannelId) {
        lines.push(`**All levels** (fallback) → <#${cfg.allChannelId}>`)
    }
    for (const lvl of LEVEL_CHOICES) {
        const id = cfg.byLevel?.[lvl]
        if (id) {
            lines.push(`**${lvl}** override → <#${id}>`)
        }
    }
    for (const lvl of LEVEL_CHOICES) {
        const ch = resolveDiscordLogChannelId(cfg, lvl)
        if (ch && !discordLogLevelAllowed(cfg, lvl)) {
            lines.push(
                `_Note: \`${lvl}\` has route <#${ch}> but is **below** the minimum level, so it will not receive logs._`
            )
        }
    }
    return lines.join("\n")
}

export default {
    data: new SlashCommandBuilder()
        .setName("discord-logs")
        .setDescription("Configure Discord channels for bot log forwarding in this server.")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false)
        .addSubcommand((sub) =>
            sub
                .setName("set")
                .setDescription("Set the log channel for all levels or for one level.")
                .addChannelOption((opt) =>
                    opt
                        .setName("channel")
                        .setDescription("Text or announcement channel to receive logs")
                        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                        .setRequired(true)
                )
                .addStringOption((opt) =>
                    opt
                        .setName("scope")
                        .setDescription("All severities use this channel, or only one level")
                        .setRequired(true)
                        .addChoices(
                            { name: "All levels", value: "all" },
                            { name: "Debug only", value: "debug" },
                            { name: "Info only", value: "info" },
                            { name: "Warn only", value: "warn" },
                            { name: "Error only", value: "error" }
                        )
                )
        )
        .addSubcommand((sub) =>
            sub
                .setName("unset")
                .setDescription("Remove log channel routing for this server.")
                .addStringOption((opt) =>
                    opt
                        .setName("target")
                        .setDescription("What to clear")
                        .setRequired(true)
                        .addChoices(
                            { name: "Everything (all Discord log settings)", value: "everything" },
                            { name: "“All levels” channel only", value: "all" },
                            { name: "Debug-only route", value: "debug" },
                            { name: "Info-only route", value: "info" },
                            { name: "Warn-only route", value: "warn" },
                            { name: "Error-only route", value: "error" },
                            { name: "Minimum level filter only", value: "min-level" }
                        )
                )
        )
        .addSubcommand((sub) =>
            sub
                .setName("min-level")
                .setDescription(
                    "Only forward this severity and higher to Discord (applies after routing)."
                )
                .addStringOption((opt) =>
                    opt
                        .setName("level")
                        .setDescription(
                            "Lowest level to send; use “default” to forward all routed levels"
                        )
                        .setRequired(true)
                        .addChoices(
                            { name: "Debug and above (same as default)", value: "debug" },
                            { name: "Default — clear custom floor", value: "default" },
                            { name: "Info and above", value: "info" },
                            { name: "Warn and above", value: "warn" },
                            { name: "Errors only", value: "error" }
                        )
                )
        )
        .addSubcommand((sub) =>
            sub.setName("show").setDescription("Show current Discord log settings.")
        ),
    category: "admin",

    async execute(interaction: ChatInputCommandInteraction, client: BotClient): Promise<unknown> {
        if (!interaction.inGuild() || !interaction.guild) {
            return interaction.reply({
                content: "Use this command in a server.",
                flags: [MessageFlags.Ephemeral],
            })
        }

        const guild = interaction.guild
        const botUser = client.user
        if (!botUser) {
            return interaction.reply({
                content: "Bot user is not ready.",
                flags: [MessageFlags.Ephemeral],
            })
        }

        const sub = interaction.options.getSubcommand()
        if (!isGuildSettingsInitialized()) {
            return interaction.reply({
                content: "Bot is still starting up. Please try again in a moment.",
                flags: [MessageFlags.Ephemeral],
            })
        }
        const store = getGuildSettings()

        if (sub === "show") {
            const cfg = store[guild.id]?.discordLog
            if (!cfg) {
                return interaction.reply({
                    content:
                        "No Discord log channels are configured. Use `/discord-logs set` to add a channel.",
                    flags: [MessageFlags.Ephemeral],
                })
            }
            return interaction.reply({
                content: formatConfig(cfg),
                flags: [MessageFlags.Ephemeral],
            })
        }

        if (sub === "min-level") {
            const raw = interaction.options.getString("level", true)
            const working = detachGuildRow(store[guild.id])
            const next = detachGuildDiscordLog(working.discordLog)
            if (raw === "default" || raw === "debug") {
                delete next.minLevel
            } else {
                next.minLevel = raw as DiscordLogLevelName
            }
            applyNormalizedDiscordLog(next, working)
            const nextStore = storeWithGuildRow(store, guild.id, working)
            const ok = await saveGuildSettings(nextStore, client)
            if (!ok) {
                return interaction.reply({
                    content: "Could not save settings to database. Check database connectivity.",
                    flags: [MessageFlags.Ephemeral],
                })
            }
            return interaction.reply({
                content:
                    raw === "default" || raw === "debug"
                        ? "Minimum Discord log level reset to **debug** (all routed severities can be sent)."
                        : `Minimum Discord log level set to **${raw}** and above.`,
                flags: [MessageFlags.Ephemeral],
            })
        }

        if (sub === "unset") {
            const target = interaction.options.getString("target", true)
            const working = detachGuildRow(store[guild.id])
            const current = working.discordLog
            if (!current) {
                return interaction.reply({
                    content: "Nothing to unset — Discord logging is not configured.",
                    flags: [MessageFlags.Ephemeral],
                })
            }
            if (target === "everything") {
                delete working.discordLog
            } else if (target === "all") {
                const next = detachGuildDiscordLog(current)
                delete next.allChannelId
                applyNormalizedDiscordLog(next, working)
            } else if (target === "min-level") {
                const next = detachGuildDiscordLog(current)
                delete next.minLevel
                applyNormalizedDiscordLog(next, working)
            } else {
                const lvl = target as DiscordLogLevelName
                const next = detachGuildDiscordLog(current)
                if (next.byLevel?.[lvl]) {
                    delete next.byLevel[lvl]
                }
                applyNormalizedDiscordLog(next, working)
            }

            const nextStore = storeWithGuildRow(store, guild.id, working)
            const ok = await saveGuildSettings(nextStore, client)
            if (!ok) {
                return interaction.reply({
                    content: "Could not save settings to database. Check database connectivity.",
                    flags: [MessageFlags.Ephemeral],
                })
            }
            return interaction.reply({
                content: "Updated Discord log configuration.",
                flags: [MessageFlags.Ephemeral],
            })
        }

        if (sub === "set") {
            const selected = interaction.options.getChannel("channel", true)
            const scope = interaction.options.getString("scope", true)

            if (
                selected.type !== ChannelType.GuildText &&
                selected.type !== ChannelType.GuildAnnouncement
            ) {
                return interaction.reply({
                    content: "Choose a text or announcement channel where I can send messages.",
                    flags: [MessageFlags.Ephemeral],
                })
            }

            const channel =
                (await guild.channels.fetch(selected.id).catch((): null => null)) ?? null
            if (!channel?.isTextBased() || !channel.isSendable()) {
                return interaction.reply({
                    content: "Could not load that channel or it is not a channel I can post in.",
                    flags: [MessageFlags.Ephemeral],
                })
            }

            const perms = channel.permissionsFor(botUser)
            const need =
                PermissionFlagsBits.ViewChannel |
                PermissionFlagsBits.SendMessages |
                PermissionFlagsBits.EmbedLinks
            if (!perms?.has(need)) {
                return interaction.reply({
                    content:
                        "I need **View Channel**, **Send Messages**, and **Embed Links** in that channel.",
                    flags: [MessageFlags.Ephemeral],
                })
            }

            const latestStore = getGuildSettings()
            const working = detachGuildRow(latestStore[guild.id])
            const next = detachGuildDiscordLog(working.discordLog)
            const channelId = channel.id
            if (scope === "all") {
                next.allChannelId = channelId
            } else {
                const lvl = scope as DiscordLogLevelName
                next.byLevel = { ...next.byLevel, [lvl]: channelId }
            }

            applyNormalizedDiscordLog(next, working)
            const nextStore = storeWithGuildRow(latestStore, guild.id, working)
            const ok = await saveGuildSettings(nextStore, client)
            if (!ok) {
                return interaction.reply({
                    content: "Could not save settings to database. Check database connectivity.",
                    flags: [MessageFlags.Ephemeral],
                })
            }

            const mention = `<#${channelId}>`
            return interaction.reply({
                content:
                    scope === "all"
                        ? `Bot logs (per your minimum level) will use ${mention} for **all** severities unless a per-level route overrides.`
                        : `Bot **${scope}** logs will go to ${mention} (other levels still use “all levels” or per-level routes if set).`,
                flags: [MessageFlags.Ephemeral],
            })
        }

        return interaction.reply({
            content: "Unknown subcommand.",
            flags: [MessageFlags.Ephemeral],
        })
    },
}
