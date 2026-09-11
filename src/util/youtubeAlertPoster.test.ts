import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { ChannelType, PermissionFlagsBits, type Client } from "discord.js"
import type { YoutubeAlertEntry, YoutubeWatchEntry } from "../types/index.js"
import { postYoutubeAlert } from "./youtubeAlertPoster.js"

const watch: YoutubeWatchEntry = {
    id: 1,
    guildId: "100",
    youtubeChannelId: "UCXuqSBlHAE6Xw-yeJA0Tunw",
    youtubeChannelName: "LTT",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
}

const alert: YoutubeAlertEntry = {
    id: 7,
    watchId: 1,
    discordChannelId: "200",
    mentionRoleIds: [],
    messageTemplate: null,
    eventTypes: ["video"],
    createdBy: "300",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
}

const payload = {
    title: "New video",
    url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    type: "video" as const,
}

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

function mockClient(channel: unknown | null): Client {
    return {
        channels: {
            fetch: async () => channel,
        },
    } as never
}

function mockTextChannel(opts: {
    type?: number
    allowed?: bigint[] | null
    me?: unknown
    send?: () => Promise<unknown>
}) {
    const allowed =
        opts.allowed === null
            ? null
            : (opts.allowed ?? [
                  PermissionFlagsBits.ViewChannel,
                  PermissionFlagsBits.SendMessages,
                  PermissionFlagsBits.EmbedLinks,
              ])
    const sent: unknown[] = []
    return {
        type: opts.type ?? ChannelType.GuildText,
        id: "200",
        guild: {
            members: {
                me: opts.me === undefined ? { id: "bot" } : opts.me,
            },
        },
        permissionsFor: () => (allowed ? mockPerms(allowed) : null),
        send: async (payload: unknown) => {
            sent.push(payload)
            if (opts.send) return opts.send()
            return { id: "msg" }
        },
        sent,
    }
}

describe("postYoutubeAlert", () => {
    it("returns false when the target channel is missing", async () => {
        const warns: string[] = []
        const ok = await postYoutubeAlert(mockClient(null), watch, alert, payload, {
            warn: (text) => warns.push(text),
        })
        assert.equal(ok, false)
        assert.match(warns[0] ?? "", /missing or not a text/)
    })

    it("returns false for non-text/announcement channel types", async () => {
        const channel = mockTextChannel({ type: ChannelType.GuildVoice })
        const warns: string[] = []
        const ok = await postYoutubeAlert(mockClient(channel), watch, alert, payload, {
            warn: (text) => warns.push(text),
        })
        assert.equal(ok, false)
        assert.match(warns[0] ?? "", /missing or not a text/)
        assert.equal(channel.sent.length, 0)
    })

    it("returns false when the bot lacks send/embed permissions", async () => {
        const channel = mockTextChannel({
            allowed: [PermissionFlagsBits.ViewChannel],
        })
        const warns: string[] = []
        const ok = await postYoutubeAlert(mockClient(channel), watch, alert, payload, {
            warn: (text) => warns.push(text),
        })
        assert.equal(ok, false)
        assert.match(warns[0] ?? "", /Missing send\/embed permissions/)
        assert.equal(channel.sent.length, 0)
    })

    it("skips the permission gate when members.me is null and still posts", async () => {
        const channel = mockTextChannel({
            me: null,
            allowed: [],
        })
        const ok = await postYoutubeAlert(mockClient(channel), watch, alert, payload, {
            warn() {},
        })
        assert.equal(ok, true)
        assert.equal(channel.sent.length, 1)
    })

    it("posts to GuildAnnouncement channels when permissions are present", async () => {
        const channel = mockTextChannel({ type: ChannelType.GuildAnnouncement })
        const ok = await postYoutubeAlert(mockClient(channel), watch, alert, payload, {
            warn() {},
        })
        assert.equal(ok, true)
        assert.equal(channel.sent.length, 1)
        const sent = channel.sent[0] as { content?: string; embeds?: unknown[] }
        assert.ok(sent.embeds?.length)
    })

    it("returns false when Discord send throws", async () => {
        const channel = mockTextChannel({
            send: async () => {
                throw new Error("rate limited")
            },
        })
        const warns: unknown[] = []
        const ok = await postYoutubeAlert(mockClient(channel), watch, alert, payload, {
            warn: (...args) => warns.push(args),
        })
        assert.equal(ok, false)
        assert.equal(warns.length, 1)
    })
})
