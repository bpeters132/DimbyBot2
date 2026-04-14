import { PermissionFlagsBits } from "discord.js"

/**
 * OAuth2 `permissions` integer for "Add to server": shared by the bot guild list API and the
 * dashboard invite URL. Covers voice (Lavalink), control-channel text + embeds, bulk delete,
 * Discord log forwarding (embeds), and dev commands that attach files (`/eval`, `/log-review`).
 */
const BOT_INVITE_PERMISSION_FLAGS =
    PermissionFlagsBits.ViewChannel |
    PermissionFlagsBits.SendMessages |
    PermissionFlagsBits.EmbedLinks |
    PermissionFlagsBits.ManageMessages |
    PermissionFlagsBits.AttachFiles |
    PermissionFlagsBits.ReadMessageHistory |
    PermissionFlagsBits.Connect |
    PermissionFlagsBits.Speak

/** String form for Discord OAuth `permissions=` query parameter. */
export const DISCORD_BOT_INVITE_PERMISSIONS = BOT_INVITE_PERMISSION_FLAGS.toString()
