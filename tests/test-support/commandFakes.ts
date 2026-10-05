import type { ChatInputCommandInteraction } from "discord.js"
import type BotClient from "../../src/lib/BotClient.js"

/** One recorded Discord reply from a fake interaction. */
export type RecordedMessage = {
    method:
        | "reply"
        | "editReply"
        | "followUp"
        | "deferReply"
        | "deferUpdate"
        | "update"
        | "deleteReply"
    content?: string | null
    ephemeral?: boolean
    embeds?: unknown[]
    flags?: unknown
    fetchReply?: boolean
}

/** Slash option values keyed by option name. */
export type SlashOptionBag = Record<string, unknown>

export type FakeMember = {
    id?: string
    voice?: { channel: { id: string } | null }
    permissions?: { has: (permission: unknown) => boolean }
}

export type FakeInteractionInput = {
    guild?: { id: string } | null
    /** When false, `guildMemberFromInteraction` returns null even if `member` is set. */
    inCachedGuild?: boolean
    member?: FakeMember | null
    userId?: string
    channelId?: string
    channel?: unknown
    options?: SlashOptionBag
    subcommand?: string | null
    subcommandGroup?: string | null
    createdTimestamp?: number
}

function normalizePayload(payload: unknown): Omit<RecordedMessage, "method"> {
    if (typeof payload === "string") {
        return { content: payload }
    }
    const record =
        payload != null && typeof payload === "object" ? (payload as Record<string, unknown>) : {}
    return {
        content:
            typeof record.content === "string" || record.content === null
                ? (record.content as string | null)
                : undefined,
        ephemeral: typeof record.ephemeral === "boolean" ? record.ephemeral : undefined,
        embeds: Array.isArray(record.embeds) ? record.embeds : undefined,
        flags: record.flags,
        fetchReply: record.fetchReply === true ? true : undefined,
    }
}

/** Message stand-in for `fetchReply` so commands can attach collectors or delete later. */
function fetchedMessage(createdTimestamp: number) {
    return {
        createdTimestamp: createdTimestamp + 250,
        id: "msg-1",
        async delete() {
            return undefined
        },
        createMessageComponentCollector() {
            return {
                on() {
                    return this
                },
            }
        },
    }
}

/**
 * Chat-input interaction that records replies. Defaults to a cached guild member in a voice channel.
 */
export function createSlashInteraction(input: FakeInteractionInput = {}): {
    interaction: ChatInputCommandInteraction
    calls: RecordedMessage[]
} {
    const calls: RecordedMessage[] = []
    const guild = input.guild === undefined ? { id: "guild-1" } : input.guild
    const member: FakeMember | null =
        input.member === undefined
            ? { id: input.userId ?? "user-1", voice: { channel: { id: "voice-1" } } }
            : input.member
    const options = input.options ?? {}
    const interaction = {
        guild,
        guildId: guild?.id ?? null,
        channelId: input.channelId ?? "channel-1",
        channel: input.channel ?? { id: input.channelId ?? "channel-1", isTextBased: () => true },
        user: { id: input.userId ?? "user-1", username: "tester", tag: "tester#0001" },
        member,
        createdTimestamp: input.createdTimestamp ?? 1_000,
        id: "interaction-1",
        deferred: false,
        replied: false,
        commandName: "test",
        inCachedGuild() {
            if (input.inCachedGuild === false) return false
            return guild != null && member != null
        },
        inGuild() {
            return guild != null
        },
        isChatInputCommand() {
            return true
        },
        isButton() {
            return false
        },
        isAutocomplete() {
            return false
        },
        options: {
            getString(name: string) {
                const value = options[name]
                return typeof value === "string" ? value : null
            },
            getInteger(name: string) {
                const value = options[name]
                return typeof value === "number" ? value : null
            },
            getNumber(name: string) {
                const value = options[name]
                return typeof value === "number" ? value : null
            },
            getBoolean(name: string) {
                const value = options[name]
                return typeof value === "boolean" ? value : null
            },
            getSubcommand(required?: boolean) {
                if (input.subcommand == null) {
                    if (required === false) return null
                    throw new Error("fake interaction has no subcommand")
                }
                return input.subcommand
            },
            getSubcommandGroup() {
                return input.subcommandGroup ?? null
            },
            getChannel(name: string) {
                return options[name] ?? null
            },
            getRole(name: string) {
                return options[name] ?? null
            },
            getUser(name: string) {
                return options[name] ?? null
            },
            getMember(name: string) {
                return options[name] ?? null
            },
            getAttachment(name: string) {
                return options[name] ?? null
            },
        },
        async reply(payload: unknown = {}) {
            this.replied = true
            calls.push({ method: "reply", ...normalizePayload(payload) })
            const record =
                payload != null && typeof payload === "object"
                    ? (payload as Record<string, unknown>)
                    : {}
            if (record.fetchReply === true) {
                return fetchedMessage(this.createdTimestamp)
            }
            return undefined
        },
        async editReply(payload: unknown = {}) {
            calls.push({ method: "editReply", ...normalizePayload(payload) })
            return fetchedMessage(this.createdTimestamp)
        },
        async followUp(payload: unknown = {}) {
            calls.push({ method: "followUp", ...normalizePayload(payload) })
        },
        async deferReply() {
            this.deferred = true
            calls.push({ method: "deferReply" })
        },
        async deferUpdate() {
            this.deferred = true
            calls.push({ method: "deferUpdate" })
        },
        async update(payload: unknown = {}) {
            calls.push({ method: "update", ...normalizePayload(payload) })
        },
        async deleteReply() {
            calls.push({ method: "deleteReply" })
        },
    }
    return {
        interaction: interaction as unknown as ChatInputCommandInteraction,
        calls,
    }
}

/** Contents of recorded replies, in order, skipping deferrals that have no content. */
export function messageContents(calls: RecordedMessage[]): Array<string | null | undefined> {
    return calls
        .filter((call) => call.method !== "deferReply" && call.method !== "deferUpdate")
        .map((call) => call.content)
}

export type FakeBotClient = BotClient & {
    logs: Array<{ level: string; args: unknown[] }>
}

/**
 * Bot client with an in-memory Lavalink player map. `getPlayer` and `players.get` share that map.
 */
export function createBotClientFake(
    input: {
        players?: Map<string, unknown>
        ping?: number
        user?: {
            id: string
            tag: string
            username: string
            setActivity?: (...args: unknown[]) => unknown
        } | null
        guilds?: Map<string, unknown>
        logger?: { setDebugEnabled?: (enabled: boolean) => void; isDebugEnabled?: () => boolean }
        /** Extra client fields (for example `logger` or command collections). */
        extra?: Record<string, unknown>
    } = {}
): FakeBotClient {
    const players = input.players ?? new Map<string, unknown>()
    const logs: Array<{ level: string; args: unknown[] }> = []
    const log = (level: string) => {
        return (...args: unknown[]) => {
            logs.push({ level, args })
        }
    }
    const client = {
        ws: { ping: input.ping ?? 20 },
        user:
            input.user === undefined
                ? {
                      id: "bot-1",
                      tag: "Dimby#0001",
                      username: "Dimby",
                      setActivity: async () => undefined,
                  }
                : input.user,
        lavalink: {
            players,
            getPlayer: (guildId: string) => players.get(guildId),
            init: () => undefined,
            nodeManager: { nodes: new Map() },
        },
        guilds: { cache: input.guilds ?? new Map() },
        channels: { cache: new Map() },
        error: log("error"),
        info: log("info"),
        debug: log("debug"),
        warn: log("warn"),
        logger: input.logger,
        on: () => client,
        once: () => client,
        logs,
        ...input.extra,
    }
    return client as unknown as FakeBotClient
}
