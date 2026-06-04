import { EmbedBuilder } from "discord.js"
import type { CountdownEntry } from "../types/index.js"
import { formatCountdownDuration } from "./formatCountdownDuration.js"

/** Default embed accent color (Discord blurple) when no per-countdown color is set. */
export const DEFAULT_COUNTDOWN_COLOR = 0x5865f2

/**
 * Builds the countdown embed shared by the create command and the recurring updater.
 * `now` is injectable for deterministic remaining-time calculation (defaults to current time).
 */
export function buildCountdownEmbed(entry: CountdownEntry, now: number = Date.now()): EmbedBuilder {
    const targetMs = entry.targetTime.getTime()
    const unixSeconds = Math.floor(targetMs / 1000)
    const remaining = targetMs - now
    const started = remaining <= 0

    const lines: string[] = []
    if (entry.description) {
        lines.push(entry.description, "")
    }
    lines.push(`**Starts:** <t:${unixSeconds}:F> (<t:${unixSeconds}:R>)`)
    lines.push(
        started
            ? "**Time remaining:** Event started!"
            : `**Time remaining:** ${formatCountdownDuration(remaining)}`
    )

    const embed = new EmbedBuilder()
        .setColor(entry.color ?? DEFAULT_COUNTDOWN_COLOR)
        .setTitle(entry.eventName)
        .setDescription(lines.join("\n"))
        .setFooter({ text: entry.footer ?? `Countdown #${entry.id}` })

    if (entry.imageUrl) {
        embed.setImage(entry.imageUrl)
    }

    return embed
}
