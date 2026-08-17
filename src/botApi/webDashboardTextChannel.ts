import {
    PermissionFlagsBits,
    type Guild,
    type GuildBasedChannel,
    type VoiceBasedChannel,
} from "discord.js"
import { getGuildSettings } from "../util/saveControlChannel.js"

/** Optional hooks for unit tests (defaults match production guild-settings lookup). */
export type ResolveWebDashboardTextChannelOptions = {
    getControlChannelId?: (guildId: string) => string | undefined
}

/** Whether the bot can post web-dashboard / player messages in this guild text channel. */
export function botCanUseWebDashboardTextChannel(guild: Guild, ch: GuildBasedChannel): boolean {
    const me = guild.members.me
    if (!me) return false
    const perms = ch.permissionsFor(me)
    if (!perms) return false
    const sendFlag = ch.isThread()
        ? PermissionFlagsBits.SendMessagesInThreads
        : PermissionFlagsBits.SendMessages
    return perms.has([PermissionFlagsBits.ViewChannel, sendFlag])
}

async function resolveValidTextChannelId(
    guild: Guild,
    channelId: string
): Promise<string | undefined> {
    let ch: GuildBasedChannel | undefined = guild.channels.cache.get(channelId)
    if (!ch) {
        try {
            const fetched = await guild.channels.fetch(channelId)
            ch = fetched ?? undefined
        } catch {
            ch = undefined
        }
    }
    if (ch?.isTextBased() && !ch.isDMBased() && botCanUseWebDashboardTextChannel(guild, ch)) {
        return ch.id
    }
    return undefined
}

function defaultControlChannelId(guildId: string): string | undefined {
    try {
        const settings = getGuildSettings()
        return settings[guildId]?.controlChannelId
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        if (!message.includes("Guild settings accessed before initialization")) {
            const errorName = error instanceof Error ? error.name : typeof error
            console.warn("[webDashboardTextChannel] failed to load guild settings", {
                guildId,
                errorName,
                message: message.slice(0, 300),
            })
        }
        return undefined
    }
}

/**
 * Lavalink `textChannelId` when the web dashboard creates or drives a player: prefer the requester's
 * voice channel text chat, then guild control channel if set, otherwise the guild system channel.
 */
export async function resolveWebDashboardTextChannelId(
    guild: Guild,
    voiceChannel?: VoiceBasedChannel | null,
    options?: ResolveWebDashboardTextChannelOptions
): Promise<string | undefined> {
    if (voiceChannel?.isTextBased() && !voiceChannel.isDMBased()) {
        const voiceTextId = await resolveValidTextChannelId(guild, voiceChannel.id)
        if (voiceTextId) {
            return voiceTextId
        }
    }

    const getControlChannelId = options?.getControlChannelId ?? defaultControlChannelId
    const controlId = getControlChannelId(guild.id)
    if (controlId) {
        const id = await resolveValidTextChannelId(guild, controlId)
        if (id) {
            return id
        }
    }

    const system = guild.systemChannel
    if (system && botCanUseWebDashboardTextChannel(guild, system)) {
        return system.id
    }
    if (!system && guild.systemChannelId) {
        return resolveValidTextChannelId(guild, guild.systemChannelId)
    }
    return undefined
}
