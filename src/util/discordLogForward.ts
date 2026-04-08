import { EmbedBuilder, type ColorResolvable } from "discord.js"
import type BotClient from "../lib/BotClient.js"
import type { DiscordLogLevelName, GuildDiscordLogSettings } from "../types/index.js"
import { getGuildSettings } from "./saveControlChannel.js"

const LEVEL_ORDER: Record<DiscordLogLevelName, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
}

const LEVEL_COLORS: Record<DiscordLogLevelName, ColorResolvable> = {
    debug: 0x9b59b6,
    info: 0x3498db,
    warn: 0xf1c40f,
    error: 0xe74c3c,
}

const MAX_EMBED_DESC = 3900

const TRUNCATE_SUFFIX = "\n… (truncated)"

/** Max queued Discord forwards; oldest entries are dropped when full. */
const DISCORD_LOG_FORWARD_QUEUE_CAP = 200

type DiscordLogForwardJob = {
    client: BotClient
    level: DiscordLogLevelName
    message: string
}

const discordLogForwardQueue: DiscordLogForwardJob[] = []
let discordLogForwardWorkerActive = false
let discordLogForwardWorkerScheduled = false

function enqueueDiscordLogForward(job: DiscordLogForwardJob): void {
    while (discordLogForwardQueue.length >= DISCORD_LOG_FORWARD_QUEUE_CAP) {
        discordLogForwardQueue.shift()
    }
    const last = discordLogForwardQueue[discordLogForwardQueue.length - 1]
    if (
        last &&
        last.client === job.client &&
        last.level === job.level &&
        last.message === job.message
    ) {
        return
    }
    discordLogForwardQueue.push(job)
}

async function runDiscordLogForwardWorker(): Promise<void> {
    if (discordLogForwardWorkerActive) {
        return
    }
    discordLogForwardWorkerActive = true
    try {
        while (discordLogForwardQueue.length > 0) {
            const item = discordLogForwardQueue.shift()!
            try {
                await forwardLogToDiscordChannels(item.client, item.level, item.message)
            } catch (err: unknown) {
                console.error("[discordLogForward] Failed to forward log:", err)
            }
        }
    } finally {
        discordLogForwardWorkerActive = false
        if (discordLogForwardQueue.length > 0) {
            void runDiscordLogForwardWorker()
        }
    }
}

/** Resolves the text channel id to send `level` to, or null if this guild has no target for that level. */
export function resolveDiscordLogChannelId(
    cfg: GuildDiscordLogSettings,
    level: DiscordLogLevelName
): string | null {
    const per = cfg.byLevel?.[level]
    if (per) {
        return per
    }
    if (cfg.allChannelId) {
        return cfg.allChannelId
    }
    return null
}

/** Whether `level` passes the guild's minimum Discord log threshold. */
export function discordLogLevelAllowed(
    cfg: GuildDiscordLogSettings,
    level: DiscordLogLevelName
): boolean {
    const min = cfg.minLevel ?? "debug"
    return LEVEL_ORDER[level] >= LEVEL_ORDER[min]
}

function truncateForDiscord(text: string): string {
    if (text.length <= MAX_EMBED_DESC) {
        return text
    }
    const keep = MAX_EMBED_DESC - TRUNCATE_SUFFIX.length
    return text.slice(0, Math.max(0, keep)) + TRUNCATE_SUFFIX
}

/**
 * Sends a log line to every guild that configured Discord logging for this level.
 * Skips guilds where the channel is missing or the bot lacks permission.
 */
export async function forwardLogToDiscordChannels(
    client: BotClient,
    level: DiscordLogLevelName,
    message: string
): Promise<void> {
    const settings = getGuildSettings()
    const description = truncateForDiscord(message)

    for (const [guildId, guildSettings] of Object.entries(settings)) {
        const cfg = guildSettings.discordLog
        if (!cfg) {
            continue
        }
        if (!discordLogLevelAllowed(cfg, level)) {
            continue
        }
        const channelId = resolveDiscordLogChannelId(cfg, level)
        if (!channelId) {
            continue
        }

        const guild = client.guilds.cache.get(guildId)
        if (!guild) {
            continue
        }

        let channel = guild.channels.cache.get(channelId)
        if (!channel) {
            channel = (await guild.channels.fetch(channelId).catch((): null => null)) ?? undefined
        }
        if (!channel?.isTextBased() || !channel.isSendable()) {
            continue
        }

        const embed = new EmbedBuilder()
            .setColor(LEVEL_COLORS[level])
            .setTitle(`Bot log — ${level.toUpperCase()}`)
            .setDescription(description)
            .setTimestamp()

        await channel.send({ embeds: [embed] }).catch(() => {
            /* avoid recursion into client.error */
        })
    }
}

/**
 * Schedules Discord forwarding so sync logger methods stay non-blocking.
 * Failures are logged to stderr only to avoid infinite loops.
 */
export function scheduleDiscordLogForward(
    client: BotClient,
    level: DiscordLogLevelName,
    message: string
): void {
    enqueueDiscordLogForward({ client, level, message })
    if (discordLogForwardWorkerScheduled) {
        return
    }
    discordLogForwardWorkerScheduled = true
    setImmediate(() => {
        discordLogForwardWorkerScheduled = false
        void runDiscordLogForwardWorker()
    })
}

/** Attaches the Discord forwarder to the process logger (idempotent). */
export function attachDiscordLogForwarding(client: BotClient): void {
    if (typeof client.logger.setDiscordForwarder !== "function") {
        return
    }
    client.logger.setDiscordForwarder((level, message) => {
        scheduleDiscordLogForward(client, level, message)
    })
}

/** Removes Discord forwarding (e.g. for tests) and drops queued forwards for this client. */
export function detachDiscordLogForwarding(client: BotClient): void {
    if (typeof client.logger.setDiscordForwarder === "function") {
        client.logger.setDiscordForwarder(null)
    }
    const kept = discordLogForwardQueue.filter((job) => job.client !== client)
    discordLogForwardQueue.length = 0
    discordLogForwardQueue.push(...kept)
}