import type { Guild, GuildBasedChannel } from "discord.js"
import { getGuildSettings } from "../util/saveControlChannel.js"

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
    if (ch?.isTextBased() && !ch.isDMBased()) {
        return ch.id
    }
    return undefined
}

/**
 * Lavalink `textChannelId` when the web dashboard creates a player: guild control channel if set and
 * usable, otherwise the guild system channel (same idea as `guild.systemChannelId` fallback).
 */
export async function resolveWebDashboardTextChannelId(guild: Guild): Promise<string | undefined> {
    const controlId = getGuildSettings()[guild.id]?.controlChannelId
    if (controlId) {
        const id = await resolveValidTextChannelId(guild, controlId)
        if (id) {
            return id
        }
    }

    const system = guild.systemChannel
    if (system?.isTextBased()) {
        return system.id
    }
    const systemId = guild.systemChannelId
    if (systemId) {
        return resolveValidTextChannelId(guild, systemId)
    }
    return undefined
}
