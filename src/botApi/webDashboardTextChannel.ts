import type { Guild } from "discord.js"
import { getGuildSettings } from "../util/saveControlChannel.js"

/**
 * Lavalink `textChannelId` when the web dashboard creates a player: guild control channel if set and
 * usable, otherwise the guild system channel (same idea as `guild.systemChannelId` fallback).
 */
export async function resolveWebDashboardTextChannelId(guild: Guild): Promise<string | undefined> {
    const controlId = getGuildSettings()[guild.id]?.controlChannelId
    if (controlId) {
        let ch = guild.channels.cache.get(controlId)
        if (!ch) {
            try {
                ch = await guild.channels.fetch(controlId)
            } catch {
                ch = null
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
        let sysCh = guild.channels.cache.get(systemId)
        if (!sysCh) {
            try {
                sysCh = await guild.channels.fetch(systemId)
            } catch {
                sysCh = null
            }
        }
        if (sysCh?.isTextBased() && !sysCh.isDMBased()) {
            return sysCh.id
        }
    }
    return undefined
}
