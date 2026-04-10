import type { Guild, GuildBasedChannel } from "discord.js"
import { getGuildSettings } from "../util/saveControlChannel.js"

/**
 * Lavalink `textChannelId` when the web dashboard creates a player: guild control channel if set and
 * usable, otherwise the guild system channel (same idea as `guild.systemChannelId` fallback).
 */
export async function resolveWebDashboardTextChannelId(guild: Guild): Promise<string | undefined> {
    const controlId = getGuildSettings()[guild.id]?.controlChannelId
    if (controlId) {
        let ch: GuildBasedChannel | undefined = guild.channels.cache.get(controlId)
        if (!ch) {
            try {
                const fetched = await guild.channels.fetch(controlId)
                ch = fetched ?? undefined
            } catch {
                ch = undefined
            }
        }
        if (ch?.isTextBased() && !ch.isDMBased()) {
            return ch.id
        }
    }

    const system = guild.systemChannel
    if (system?.isTextBased()) {
        return system.id
    }
    const systemId = guild.systemChannelId
    if (systemId) {
        let sysCh: GuildBasedChannel | undefined = guild.channels.cache.get(systemId)
        if (!sysCh) {
            try {
                const fetched = await guild.channels.fetch(systemId)
                sysCh = fetched ?? undefined
            } catch {
                sysCh = undefined
            }
        }
        if (sysCh?.isTextBased() && !sysCh.isDMBased()) {
            return sysCh.id
        }
    }
    return undefined
}
