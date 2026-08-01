import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { PermissionFlagsBits } from "discord.js"
import {
    botCanUseWebDashboardTextChannel,
    resolveWebDashboardTextChannelId,
} from "./webDashboardTextChannel.js"

type PermBits = bigint | readonly bigint[]

function mockPerms(allowed: bigint[]) {
    const set = new Set(allowed.map(String))
    return {
        has(flags: PermBits) {
            const list = Array.isArray(flags) ? flags : [flags]
            return list.every((f) => set.has(String(f)))
        },
    }
}

function mockTextChannel(opts: {
    id: string
    allowed?: bigint[]
    isThread?: boolean
    inCache?: boolean
    fetchFails?: boolean
}) {
    const allowed =
        opts.allowed ??
        [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
    const ch = {
        id: opts.id,
        isThread: () => Boolean(opts.isThread),
        isTextBased: () => true,
        isDMBased: () => false,
        permissionsFor: () => mockPerms(allowed),
    }
    return {
        channel: ch,
        inCache: opts.inCache !== false,
        fetchFails: Boolean(opts.fetchFails),
    }
}

function mockGuild(opts: {
    channels: ReturnType<typeof mockTextChannel>[]
    systemChannelId?: string | null
    me?: unknown
}) {
    const cache = new Map<string, unknown>()
    for (const entry of opts.channels) {
        if (entry.inCache) cache.set(entry.channel.id, entry.channel)
    }
    const byId = new Map(opts.channels.map((c) => [c.channel.id, c]))

    const systemId = opts.systemChannelId ?? null
    const systemEntry = systemId ? byId.get(systemId) : undefined

    return {
        id: "guild-1",
        members: { me: opts.me === undefined ? { id: "bot" } : opts.me },
        systemChannelId: systemId,
        systemChannel: systemEntry?.channel ?? null,
        channels: {
            cache,
            fetch: async (id: string) => {
                const entry = byId.get(id)
                if (!entry || entry.fetchFails) throw new Error("unknown channel")
                return entry.channel
            },
        },
    } as never
}

describe("botCanUseWebDashboardTextChannel", () => {
    it("requires ViewChannel + SendMessages for normal text channels", () => {
        const guild = mockGuild({
            channels: [
                mockTextChannel({
                    id: "ok",
                    allowed: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
                }),
                mockTextChannel({
                    id: "no-send",
                    allowed: [PermissionFlagsBits.ViewChannel],
                }),
            ],
        })
        const ok = (guild as { channels: { cache: Map<string, never> } }).channels.cache.get("ok")
        const noSend = (guild as { channels: { cache: Map<string, never> } }).channels.cache.get(
            "no-send"
        )
        assert.equal(botCanUseWebDashboardTextChannel(guild, ok!), true)
        assert.equal(botCanUseWebDashboardTextChannel(guild, noSend!), false)
    })

    it("requires SendMessagesInThreads for thread channels", () => {
        const guild = mockGuild({
            channels: [
                mockTextChannel({
                    id: "thread",
                    isThread: true,
                    allowed: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessagesInThreads,
                    ],
                }),
                mockTextChannel({
                    id: "thread-wrong-flag",
                    isThread: true,
                    allowed: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
                }),
            ],
        })
        const thread = (guild as { channels: { cache: Map<string, never> } }).channels.cache.get(
            "thread"
        )
        const wrong = (guild as { channels: { cache: Map<string, never> } }).channels.cache.get(
            "thread-wrong-flag"
        )
        assert.equal(botCanUseWebDashboardTextChannel(guild, thread!), true)
        assert.equal(botCanUseWebDashboardTextChannel(guild, wrong!), false)
    })

    it("rejects when the bot member is missing", () => {
        const guild = mockGuild({
            me: null,
            channels: [
                mockTextChannel({
                    id: "ok",
                    allowed: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
                }),
            ],
        })
        const ok = (guild as { channels: { cache: Map<string, never> } }).channels.cache.get("ok")
        assert.equal(botCanUseWebDashboardTextChannel(guild, ok!), false)
    })
})

describe("resolveWebDashboardTextChannelId", () => {
    it("prefers the requester voice text channel when usable", async () => {
        const voice = mockTextChannel({ id: "voice-text" }).channel
        const guild = mockGuild({
            channels: [
                mockTextChannel({ id: "voice-text" }),
                mockTextChannel({ id: "control" }),
                mockTextChannel({ id: "system" }),
            ],
            systemChannelId: "system",
        })
        const id = await resolveWebDashboardTextChannelId(guild, voice as never, {
            getControlChannelId: () => "control",
        })
        assert.equal(id, "voice-text")
    })

    it("falls back to control channel when voice text is unusable", async () => {
        const voice = mockTextChannel({
            id: "voice-text",
            allowed: [PermissionFlagsBits.ViewChannel],
        }).channel
        const guild = mockGuild({
            channels: [
                mockTextChannel({
                    id: "voice-text",
                    allowed: [PermissionFlagsBits.ViewChannel],
                }),
                mockTextChannel({ id: "control" }),
                mockTextChannel({ id: "system" }),
            ],
            systemChannelId: "system",
        })
        const id = await resolveWebDashboardTextChannelId(guild, voice as never, {
            getControlChannelId: () => "control",
        })
        assert.equal(id, "control")
    })

    it("falls back to system channel when control is missing or unusable", async () => {
        const guild = mockGuild({
            channels: [
                mockTextChannel({
                    id: "control",
                    allowed: [PermissionFlagsBits.ViewChannel],
                }),
                mockTextChannel({ id: "system" }),
            ],
            systemChannelId: "system",
        })
        const id = await resolveWebDashboardTextChannelId(guild, null, {
            getControlChannelId: () => "control",
        })
        assert.equal(id, "system")
    })

    it("fetches uncached systemChannelId when systemChannel is null", async () => {
        const system = mockTextChannel({ id: "system-fetched", inCache: false })
        const guild = mockGuild({
            channels: [system],
            systemChannelId: "system-fetched",
        })
        // Force systemChannel null while keeping systemChannelId (common after partial cache).
        ;(guild as { systemChannel: unknown }).systemChannel = null
        const id = await resolveWebDashboardTextChannelId(guild, null, {
            getControlChannelId: () => undefined,
        })
        assert.equal(id, "system-fetched")
    })

    it("returns undefined when no candidate channel is usable", async () => {
        const guild = mockGuild({
            channels: [
                mockTextChannel({
                    id: "control",
                    allowed: [],
                }),
            ],
            systemChannelId: null,
        })
        const id = await resolveWebDashboardTextChannelId(guild, null, {
            getControlChannelId: () => "control",
        })
        assert.equal(id, undefined)
    })
})
