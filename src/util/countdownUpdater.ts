import type BotClient from "../lib/BotClient.js"
import { buildCountdownEmbed } from "./countdownEmbed.js"
import { getAllCountdowns, removeCountdown } from "./countdownStore.js"

/** Discord API error codes treated as permanently unrecoverable for a countdown message. */
const UNRECOVERABLE_CODES = new Set([
    10003, // Unknown Channel
    10008, // Unknown Message
    50001, // Missing Access
    50013, // Missing Permissions
])

function isUnrecoverableError(error: unknown): boolean {
    if (typeof error === "object" && error !== null && "code" in error) {
        const code = (error as { code: unknown }).code
        return typeof code === "number" && UNRECOVERABLE_CODES.has(code)
    }
    return false
}

/**
 * Refreshes every countdown message once. Edits each embed with the latest remaining time,
 * removes countdowns whose channel/message is gone or whose permissions were lost, and removes
 * expired countdowns after writing their final "Event started!" state.
 */
export async function updateAllCountdowns(client: BotClient): Promise<void> {
    const countdowns = Object.values(getAllCountdowns())
    if (countdowns.length === 0) return

    const now = Date.now()

    for (const entry of countdowns) {
        try {
            const channel = await client.channels.fetch(entry.channelId).catch((): null => null)
            if (!channel || !("messages" in channel)) {
                await removeCountdown(entry.id)
                continue
            }

            const message = await channel.messages.fetch(entry.messageId).catch((): null => null)
            if (!message) {
                await removeCountdown(entry.id)
                continue
            }

            await message.edit({ content: null, embeds: [buildCountdownEmbed(entry, now)] })

            if (entry.targetTime.getTime() <= now) {
                await removeCountdown(entry.id)
            }
        } catch (error: unknown) {
            if (isUnrecoverableError(error)) {
                await removeCountdown(entry.id).catch((removeErr: unknown) =>
                    client.warn(
                        `[countdown] Failed to remove unrecoverable countdown #${entry.id}:`,
                        removeErr
                    )
                )
            } else {
                client.warn(`[countdown] Failed to update countdown #${entry.id}:`, error)
            }
        }
    }
}
