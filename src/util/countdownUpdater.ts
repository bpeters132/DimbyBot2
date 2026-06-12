import type { Message, SendableChannels, TextBasedChannel } from "discord.js"
import type BotClient from "../lib/BotClient.js"
import type { CountdownEntry } from "../types/index.js"
import { buildCountdownEmbed, buildCountdownFinishEmbed } from "./countdownEmbed.js"
import { getAllCountdowns, getCountdown, removeCountdown } from "./countdownStore.js"

/**
 * Discord API error codes that mean the countdown target no longer exists.
 * Permission errors (50001/50013) are retried — they are often temporary and must not
 * delete persisted countdown configuration (see handleControlChannel for the same pattern).
 */
const UNRECOVERABLE_CODES = new Set([
    10003, // Unknown Channel
    10008, // Unknown Message
])

function isUnrecoverableError(error: unknown): boolean {
    if (typeof error === "object" && error !== null && "code" in error) {
        const code = (error as { code: unknown }).code
        return typeof code === "number" && UNRECOVERABLE_CODES.has(code)
    }
    return false
}

/**
 * Posts the finish announcement (optional text + role ping + re-posted image) into the
 * countdown's own channel. No-op when nothing was configured to announce. Errors are swallowed
 * so they never block cleanup of the expired countdown.
 */
async function postFinishMessage(
    client: BotClient,
    channel: SendableChannels,
    entry: CountdownEntry
): Promise<void> {
    const mention = entry.mentionRoleId ? `<@&${entry.mentionRoleId}>` : ""
    const content = [mention, entry.finishMessage ?? ""].filter(Boolean).join(" ").trim()
    const finishEmbed = buildCountdownFinishEmbed(entry)
    if (!content && !finishEmbed) return

    try {
        await channel.send({
            content: content || undefined,
            embeds: finishEmbed ? [finishEmbed] : [],
            allowedMentions: { roles: entry.mentionRoleId ? [entry.mentionRoleId] : [] },
        })
    } catch (error: unknown) {
        client.warn(`[countdown] Failed to post finish message for countdown #${entry.id}:`, error)
    }
}

/**
 * Refreshes every countdown message once. Edits each embed with the latest remaining time,
 * removes countdowns whose channel/message is gone, and removes
 * expired countdowns after writing their final "Event started!" state.
 */
export async function updateAllCountdowns(client: BotClient): Promise<void> {
    const countdowns = Object.values(getAllCountdowns())
    if (countdowns.length === 0) return

    const now = Date.now()

    for (const entry of countdowns) {
        try {
            let channel: TextBasedChannel
            try {
                const fetched = await client.channels.fetch(entry.channelId)
                if (fetched == null) {
                    await removeCountdown(entry.id)
                    continue
                }
                if (!("messages" in fetched)) {
                    await removeCountdown(entry.id)
                    continue
                }
                channel = fetched
            } catch (error: unknown) {
                if (isUnrecoverableError(error)) {
                    await removeCountdown(entry.id)
                } else {
                    client.warn(
                        `[countdown] Transient channel fetch failure for countdown #${entry.id}; will retry:`,
                        error
                    )
                }
                continue
            }

            let message: Message
            try {
                message = await channel.messages.fetch(entry.messageId)
            } catch (error: unknown) {
                if (isUnrecoverableError(error)) {
                    await removeCountdown(entry.id)
                } else {
                    client.warn(
                        `[countdown] Transient message fetch failure for countdown #${entry.id}; will retry:`,
                        error
                    )
                }
                continue
            }

            await message.edit({ content: null, embeds: [buildCountdownEmbed(entry, now)] })

            if (entry.targetTime.getTime() <= now) {
                // Another interval pass may have already cleared this countdown (stale snapshot).
                if (!getCountdown(entry.id)) {
                    continue
                }
                // Remove before posting so a failed DB delete cannot re-ping every interval.
                await removeCountdown(entry.id)
                if (channel.isSendable()) {
                    await postFinishMessage(client, channel, entry)
                }
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
