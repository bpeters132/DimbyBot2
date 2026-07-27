import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { DISCORD_BOT_INVITE_PERMISSIONS } from "../shared/discordBotPermissions.js"
import { getDiscordBotInviteUrl } from "../web/lib/discord-bot-invite.js"

describe("getDiscordBotInviteUrl", () => {
    it("builds an authorize URL with encoded client id, shared permissions, and bot scopes", () => {
        const prev = process.env.CLIENT_ID
        try {
            process.env.CLIENT_ID = "123456789012345678"
            const url = getDiscordBotInviteUrl()
            assert.ok(url)
            const parsed = new URL(url!)
            assert.equal(parsed.origin + parsed.pathname, "https://discord.com/oauth2/authorize")
            assert.equal(parsed.searchParams.get("client_id"), "123456789012345678")
            assert.equal(parsed.searchParams.get("permissions"), DISCORD_BOT_INVITE_PERMISSIONS)
            assert.equal(parsed.searchParams.get("scope"), "bot applications.commands")
        } finally {
            if (prev === undefined) delete process.env.CLIENT_ID
            else process.env.CLIENT_ID = prev
        }
    })

    it("returns null when CLIENT_ID is missing or blank", () => {
        const prev = process.env.CLIENT_ID
        try {
            delete process.env.CLIENT_ID
            assert.equal(getDiscordBotInviteUrl(), null)
            process.env.CLIENT_ID = "   "
            assert.equal(getDiscordBotInviteUrl(), null)
        } finally {
            if (prev === undefined) delete process.env.CLIENT_ID
            else process.env.CLIENT_ID = prev
        }
    })
})
