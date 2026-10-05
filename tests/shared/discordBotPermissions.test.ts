import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { DISCORD_BOT_INVITE_PERMISSIONS } from "../../src/shared/discordBotPermissions.js"

/**
 * Discord API permission bit positions (not discord.js — this module must stay web-safe).
 * @see https://discord.com/developers/docs/topics/permissions
 */
const VIEW_CHANNEL = 1n << 10n
const SEND_MESSAGES = 1n << 11n
const MANAGE_MESSAGES = 1n << 13n
const EMBED_LINKS = 1n << 14n
const ATTACH_FILES = 1n << 15n
const READ_MESSAGE_HISTORY = 1n << 16n
const CONNECT = 1n << 20n
const SPEAK = 1n << 21n

const ADMINISTRATOR = 1n << 3n
const MANAGE_GUILD = 1n << 5n
const KICK_MEMBERS = 1n << 1n
const BAN_MEMBERS = 1n << 2n
const MANAGE_ROLES = 1n << 28n
const MANAGE_WEBHOOKS = 1n << 29n
const MENTION_EVERYONE = 1n << 17n

describe("DISCORD_BOT_INVITE_PERMISSIONS", () => {
    it("is a decimal digit string for the OAuth permissions query param", () => {
        assert.match(DISCORD_BOT_INVITE_PERMISSIONS, /^\d+$/)
        assert.equal(
            BigInt(DISCORD_BOT_INVITE_PERMISSIONS).toString(),
            DISCORD_BOT_INVITE_PERMISSIONS
        )
    })

    it("includes voice, text, embed, attach, history, and manage-messages bits", () => {
        const bits = BigInt(DISCORD_BOT_INVITE_PERMISSIONS)
        assert.equal(bits & VIEW_CHANNEL, VIEW_CHANNEL)
        assert.equal(bits & SEND_MESSAGES, SEND_MESSAGES)
        assert.equal(bits & MANAGE_MESSAGES, MANAGE_MESSAGES)
        assert.equal(bits & EMBED_LINKS, EMBED_LINKS)
        assert.equal(bits & ATTACH_FILES, ATTACH_FILES)
        assert.equal(bits & READ_MESSAGE_HISTORY, READ_MESSAGE_HISTORY)
        assert.equal(bits & CONNECT, CONNECT)
        assert.equal(bits & SPEAK, SPEAK)
    })

    it("does not grant Administrator or other privileged guild-management bits", () => {
        const bits = BigInt(DISCORD_BOT_INVITE_PERMISSIONS)
        assert.equal(bits & ADMINISTRATOR, 0n)
        assert.equal(bits & MANAGE_GUILD, 0n)
        assert.equal(bits & KICK_MEMBERS, 0n)
        assert.equal(bits & BAN_MEMBERS, 0n)
        assert.equal(bits & MANAGE_ROLES, 0n)
        assert.equal(bits & MANAGE_WEBHOOKS, 0n)
        assert.equal(bits & MENTION_EVERYONE, 0n)
    })
})
