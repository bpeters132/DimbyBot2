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

/** Discord snowflake shape used to scope forwarded log lines to a guild. */
const DISCORD_SNOWFLAKE_RE = /^\d{17,19}$/

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

const SNOWFLAKE_CAPTURE = String.raw`(\d{17,19})(?!\d)`

/**
 * Markers trusted when no user quote sits in front of them.
 * Covers `guild` / `guildId` labels, `Guild: <id>`, `guildId=<id>`, session-restore
 * `for <id>`, and Lavalink `player <id>` lines.
 */
const BARE_GUILD_MARKER_SOURCES: readonly string[] = [
    String.raw`\bguild(?:id)?\b\s*[:=]?\s*${SNOWFLAKE_CAPTURE}`,
    String.raw`\bfor\s+${SNOWFLAKE_CAPTURE}`,
    String.raw`\bplayer\s+${SNOWFLAKE_CAPTURE}`,
    String.raw`\bin guild\s+[^()]{0,120}\(${SNOWFLAKE_CAPTURE}\)`,
]

/**
 * Markers trusted after a balanced quoted span. Space-separated `guild <id>` and `for <id>`
 * stay off this list so a quote breakout or a guild name cannot invent a destination.
 * `in guild <id>` and `in guild <name> (<id>)` are phrasings our own log lines use after a title.
 */
const EXPLICIT_GUILD_MARKER_SOURCES: readonly string[] = [
    String.raw`\bguildId\b\s*[:=]\s*${SNOWFLAKE_CAPTURE}`,
    String.raw`\bguild\b\s*[:=]\s*${SNOWFLAKE_CAPTURE}`,
    String.raw`\bin guild\s+${SNOWFLAKE_CAPTURE}(?!\s*\()`,
    String.raw`\bin guild\s+[^()]{0,120}\(${SNOWFLAKE_CAPTURE}\)`,
]

type GuildMarkerHit = {
    index: number
    id: string
}

type GuildMarkerRegion = {
    text: string
    offset: number
    sources: readonly string[]
}

function guildMarkerHits(
    text: string,
    offset: number,
    sources: readonly string[]
): GuildMarkerHit[] {
    const hits: GuildMarkerHit[] = []
    for (const source of sources) {
        for (const match of text.matchAll(new RegExp(source, "gi"))) {
            const id = match[1]
            if (!id || match.index === undefined) continue
            hits.push({ index: offset + match.index, id })
        }
    }
    return hits
}

/**
 * Text the process wrote, split around double quotes.
 * The interior of quotes and anything between the first and last quote is user content or a
 * breakout (`query "x" guild <id>"`). An unpaired trailing quote drops the tail.
 * A balanced suffix (after the last quote) still carries our own `guildId=` / `in guild` markers.
 */
function guildMarkerSearchRegions(message: string): GuildMarkerRegion[] {
    let first = -1
    let lastClose = -1
    let open = false
    for (let i = 0; i < message.length; i++) {
        if (message[i] !== '"') continue
        if (first === -1) first = i
        open = !open
        if (!open) lastClose = i
    }
    if (first === -1) {
        return [{ text: message, offset: 0, sources: BARE_GUILD_MARKER_SOURCES }]
    }
    const regions: GuildMarkerRegion[] = [
        { text: message.slice(0, first), offset: 0, sources: BARE_GUILD_MARKER_SOURCES },
    ]
    if (!open && lastClose !== -1) {
        regions.push({
            text: message.slice(lastClose + 1),
            offset: lastClose + 1,
            sources: EXPLICIT_GUILD_MARKER_SOURCES,
        })
    }
    return regions
}

function skipJsonWs(message: string, index: number): number {
    let i = index
    while (i < message.length) {
        const c = message[i]
        if (c !== " " && c !== "\n" && c !== "\r" && c !== "\t") break
        i++
    }
    return i
}

function jsonEscapeChar(escaped: string): string | null {
    switch (escaped) {
        case '"':
        case "\\":
        case "/":
            return escaped
        case "b":
            return "\b"
        case "f":
            return "\f"
        case "n":
            return "\n"
        case "r":
            return "\r"
        case "t":
            return "\t"
        default:
            return null
    }
}

/** Decoded JSON string starting at `quoteAt`, or null when the quotes are not well formed. */
function readJsonString(message: string, quoteAt: number): { value: string; end: number } | null {
    if (message[quoteAt] !== '"') return null
    let value = ""
    let i = quoteAt + 1
    while (i < message.length) {
        const c = message[i]
        if (c === "\\") {
            const escaped = message[i + 1]
            if (escaped === undefined) return null
            if (escaped === "u") {
                const hex = message.slice(i + 2, i + 6)
                if (!/^[0-9a-fA-F]{4}$/.test(hex)) return null
                value += String.fromCharCode(Number.parseInt(hex, 16))
                i += 6
                continue
            }
            const decoded = jsonEscapeChar(escaped)
            if (decoded === null) return null
            value += decoded
            i += 2
            continue
        }
        if (c === '"') return { value, end: i + 1 }
        value += c
        i++
    }
    return null
}

function skipJsonNumber(message: string, index: number): number | null {
    const match = /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(message.slice(index))
    if (!match) return null
    return index + match[0].length
}

/** Skip one JSON value. Nested objects are not searched for a guild id. */
function skipJsonValue(message: string, index: number): number | null {
    const i = skipJsonWs(message, index)
    const c = message[i]
    if (c === '"') {
        const text = readJsonString(message, i)
        return text ? text.end : null
    }
    if (c === "{" || c === "[") return skipJsonContainer(message, i)
    if (c === "-" || (c !== undefined && c >= "0" && c <= "9")) return skipJsonNumber(message, i)
    if (message.startsWith("true", i)) return i + 4
    if (message.startsWith("false", i)) return i + 5
    if (message.startsWith("null", i)) return i + 4
    return null
}

function skipJsonContainer(message: string, start: number): number | null {
    const open = message[start]
    if (open !== "{" && open !== "[") return null
    let depth = 0
    let i = start
    while (i < message.length) {
        const c = message[i]
        if (c === '"') {
            const text = readJsonString(message, i)
            if (!text) return null
            i = text.end
            continue
        }
        if (c === "{" || c === "[") depth++
        else if (c === "}" || c === "]") {
            depth--
            if (depth === 0) return i + 1
        }
        i++
    }
    return null
}

function jsonSnowflakeAt(message: string, index: number): { id: string; end: number } | null {
    if (message[index] === '"') {
        const text = readJsonString(message, index)
        if (!text || !DISCORD_SNOWFLAKE_RE.test(text.value)) return null
        return { id: text.value, end: text.end }
    }
    if (message[index] !== undefined && message[index] >= "0" && message[index] <= "9") {
        const match = /^\d+/.exec(message.slice(index))
        if (!match || !DISCORD_SNOWFLAKE_RE.test(match[0])) return null
        const end = index + match[0].length
        const next = message[end]
        if (next === "." || next === "e" || next === "E") return null
        return { id: match[0], end }
    }
    return null
}

/**
 * Top-level `"guildId"` of an object the logger serialized.
 * Nested objects are skipped so a user string or error payload cannot supply the key.
 */
function readTopLevelJsonGuildId(message: string, start: number): GuildMarkerHit | null {
    if (message[start] !== "{") return null
    let i = skipJsonWs(message, start + 1)
    if (message[i] === "}") return null
    while (i < message.length) {
        if (message[i] !== '"') return null
        const keyAt = i
        const key = readJsonString(message, i)
        if (!key) return null
        i = skipJsonWs(message, key.end)
        if (message[i] !== ":") return null
        i = skipJsonWs(message, i + 1)
        const snowflake = jsonSnowflakeAt(message, i)
        if (key.value === "guildId" && snowflake) {
            return { index: keyAt, id: snowflake.id }
        }
        const next = snowflake ? snowflake.end : skipJsonValue(message, i)
        if (next === null || next <= i) return null
        i = skipJsonWs(message, next)
        if (message[i] === "}") return null
        if (message[i] !== ",") return null
        i = skipJsonWs(message, i + 1)
        if (message[i] === "}") return null
    }
    return null
}

/**
 * `"guildId":"<snowflake>"` from structured logger arguments.
 * The `{` must sit before any `"` so a quoted query cannot smuggle a JSON key.
 */
function jsonGuildIdHits(message: string): GuildMarkerHit[] {
    const firstQuote = message.indexOf('"')
    const limit = firstQuote === -1 ? message.length : firstQuote
    const hits: GuildMarkerHit[] = []
    for (let i = 0; i < limit; i++) {
        if (message[i] !== "{") continue
        const hit = readTopLevelJsonGuildId(message, i)
        if (hit) hits.push(hit)
    }
    return hits
}

function earliestGuildMarker(hits: GuildMarkerHit[]): string | null {
    let best: GuildMarkerHit | null = null
    for (const hit of hits) {
        if (!best || hit.index < best.index) best = hit
    }
    return best?.id ?? null
}

/**
 * Guild snowflake the process attached to a log line.
 * The earliest trusted marker wins, so a later title cannot add a second destination.
 * Quoted queries, titles, and quote breakouts are not markers. JSON `"guildId"` keys,
 * `guild=` / `guildId:` assignments, `for <id>` / `player <id>`, and `in guild <id>` are.
 */
function routingGuildId(message: string): string | null {
    const hits: GuildMarkerHit[] = []
    for (const region of guildMarkerSearchRegions(message)) {
        hits.push(...guildMarkerHits(region.text, region.offset, region.sources))
    }
    hits.push(...jsonGuildIdHits(message))
    return earliestGuildMarker(hits)
}

/**
 * Whether a process log line should be forwarded to a guild's Discord log channel.
 * Requires the earliest trusted guild marker to be this guild, so a member cannot steer
 * another tenant's log channel by embedding that guild's snowflake in a query, URL, path,
 * or track title.
 */
export function logMessageBelongsToGuild(message: string, guildId: string): boolean {
    if (!guildId || !DISCORD_SNOWFLAKE_RE.test(guildId)) {
        return false
    }
    return routingGuildId(message) === guildId
}

/**
 * Sends a log line to every guild that configured Discord logging for this level.
 * Skips guilds where the channel is missing or the bot lacks permission.
 * Only forwards lines that reference that guild's id (cross-tenant isolation).
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
        if (!logMessageBelongsToGuild(message, guildId)) {
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
