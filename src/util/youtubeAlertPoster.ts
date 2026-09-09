import {
    ChannelType,
    PermissionFlagsBits,
    type Client,
    type GuildTextBasedChannel,
} from "discord.js"
import { thumbnailUrlFromUri } from "../shared/youtube-thumbnail.js"
import type { UploadEventType, YoutubeAlertEntry, YoutubeWatchEntry } from "../types/index.js"
import { renderUploadAlertMessage } from "./youtubeAlertTemplate.js"

const REQUIRED_CHANNEL_PERMS = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
]

export type UploadAlertPostPayload = {
    title: string
    url: string
    type: UploadEventType
    thumbnailUrl?: string | null
}

/** Posts one Upload Alert. Returns false when Discord rejects the send (caller leaves unseen to retry). */
export async function postYoutubeAlert(
    client: Client,
    watch: YoutubeWatchEntry,
    alert: YoutubeAlertEntry,
    payload: UploadAlertPostPayload,
    log: { warn: (text: string, ...args: unknown[]) => void }
): Promise<boolean> {
    try {
        const channel = await client.channels.fetch(alert.discordChannelId)
        if (
            !channel ||
            (channel.type !== ChannelType.GuildText &&
                channel.type !== ChannelType.GuildAnnouncement)
        ) {
            log.warn(
                `[yt-alerts] Alert #${alert.id} target ${alert.discordChannelId} is missing or not a text/announcement channel.`
            )
            return false
        }
        const textChannel = channel as GuildTextBasedChannel
        const me = textChannel.guild.members.me
        if (me && !textChannel.permissionsFor(me)?.has(REQUIRED_CHANNEL_PERMS)) {
            log.warn(
                `[yt-alerts] Missing send/embed permissions for Alert #${alert.id} in #${textChannel.id}.`
            )
            return false
        }
        const thumbnailUrl =
            payload.thumbnailUrl ??
            (payload.type === "community" ? null : thumbnailUrlFromUri(payload.url))
        const { content, embed, components } = renderUploadAlertMessage({
            title: payload.title,
            url: payload.url,
            creator: watch.youtubeChannelName,
            type: payload.type,
            mentionRoleIds: alert.mentionRoleIds,
            template: alert.messageTemplate,
            thumbnailUrl,
        })
        await textChannel.send({
            content,
            embeds: [embed],
            components,
            allowedMentions: { parse: [], roles: alert.mentionRoleIds },
        })
        return true
    } catch (error: unknown) {
        log.warn(`[yt-alerts] Failed to post Alert #${alert.id} for Watch #${watch.id}:`, error)
        return false
    }
}
