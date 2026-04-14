/**
 * OAuth2 `permissions` integer for "Add to server": shared by the bot guild list API and the
 * dashboard invite URL. Covers voice (Lavalink), control-channel text + embeds, bulk delete,
 * Discord log forwarding (embeds), and dev commands that attach files (`/eval`, `/log-review`).
 *
 * Uses raw bit positions so this module has no `discord.js` dependency (safe for the web build).
 */
const BOT_INVITE_PERMISSION_FLAGS =
    (1n << 10n) | // ViewChannel
    (1n << 11n) | // SendMessages
    (1n << 14n) | // EmbedLinks
    (1n << 13n) | // ManageMessages
    (1n << 15n) | // AttachFiles
    (1n << 16n) | // ReadMessageHistory
    (1n << 20n) | // Connect
    (1n << 21n) //  Speak

/** String form for Discord OAuth `permissions=` query parameter. */
export const DISCORD_BOT_INVITE_PERMISSIONS = BOT_INVITE_PERMISSION_FLAGS.toString()
