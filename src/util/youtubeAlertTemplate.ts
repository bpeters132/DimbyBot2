import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js"
import { sanitizeHttpUrl } from "../shared/http-url.js"
import type { UploadEventType } from "../types/index.js"

export const DEFAULT_UPLOAD_ALERT_TEMPLATE = "{creator} posted a {type}: {title}\n{url}"

export type UploadAlertRenderInput = {
    title: string
    url: string
    creator: string
    type: UploadEventType
    mentionRoleIds: string[]
    template: string | null
    thumbnailUrl?: string | null
}

/** Discord role mention markup for the configured guild roles. */
export function formatRoleMentions(roleIds: string[]): string {
    return roleIds.map((id) => `<@&${id}>`).join(" ")
}

function applyPlaceholders(
    template: string,
    input: UploadAlertRenderInput,
    roleText: string
): string {
    return template
        .replaceAll("{title}", input.title)
        .replaceAll("{url}", input.url)
        .replaceAll("{creator}", input.creator)
        .replaceAll("{type}", input.type)
        .replaceAll("{role}", roleText)
}

/**
 * Builds message content (mentions ping here, not in the embed), a fixed YouTube card,
 * and a Link button to the video. The embed title is plain text; the button is the click-through.
 * If the template contains `{role}`, mentions are placed there; otherwise they are prepended.
 */
export function renderUploadAlertMessage(input: UploadAlertRenderInput): {
    content: string
    embed: EmbedBuilder
    components: ActionRowBuilder<ButtonBuilder>[]
} {
    const roleText = formatRoleMentions(input.mentionRoleIds)
    const template = input.template?.trim() || DEFAULT_UPLOAD_ALERT_TEMPLATE
    const body = applyPlaceholders(template, input, roleText)
    const content = template.includes("{role}")
        ? body
        : [roleText, body].filter((part) => part.trim().length > 0).join("\n")

    const embed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle(input.title.slice(0, 256))
        .setAuthor({ name: input.creator.slice(0, 256) })
        .setFooter({ text: input.type })
    if (input.thumbnailUrl) {
        embed.setImage(input.thumbnailUrl)
    }

    const watchUrl = sanitizeHttpUrl(input.url)
    const components: ActionRowBuilder<ButtonBuilder>[] = []
    if (watchUrl) {
        const label = input.type === "community" ? "View on YouTube" : "Watch on YouTube"
        components.push(
            new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(watchUrl).setLabel(label)
            )
        )
    }

    return { content: content.slice(0, 2000), embed, components }
}
