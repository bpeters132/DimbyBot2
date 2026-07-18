import type { VoiceBasedChannel } from "discord.js"

/** Counts non-bot members in a voice channel (used for alone-in-VC cleanup and session restore). */
export function countHumanMembers(voiceChannel: VoiceBasedChannel): number {
    const guild = voiceChannel.guild
    const botId = guild.client.user?.id
    // Voice states are authoritative; voiceChannel.members only includes cached GuildMembers.
    return guild.voiceStates.cache.filter(
        (vs) => vs.channelId === voiceChannel.id && vs.id !== botId
    ).size
}
