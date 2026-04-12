import { PermissionFlagsBits, type Guild, type GuildBasedChannel } from "discord.js"
import { getGuildSettings } from "../util/saveControlChannel.js"

function botCanUseWebDashboardTextChannel(guild: Guild, ch: GuildBasedChannel): boolean {
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

/**
 * Lavalink `textChannelId` when the web dashboard creates a player: guild control channel if set and
 * usable, otherwise the guild system channel (same idea as `guild.systemChannelId` fallback).
 */
export async function resolveWebDashboardTextChannelId(guild: Guild): Promise<string | undefined> {
    let controlId: string | undefined
    try {
        const settings = getGuildSettings()
        controlId = settings[guild.id]?.controlChannelId
    } catch {
        controlId = undefined
    }
    if (controlId) {
        const id = await resolveValidTextChannelId(guild, controlId)
        if (id) {
            return id
        }
    }

    const system = guild.systemChannel
    if (
        system?.isTextBased() &&
        !system.isDMBased() &&
        botCanUseWebDashboardTextChannel(guild, system)
    ) {
        return system.id
    }
    const systemId = guild.systemChannelId
    if (systemId) {
        return resolveValidTextChannelId(guild, systemId)
    }
    return undefined
}
