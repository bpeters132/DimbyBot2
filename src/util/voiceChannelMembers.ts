import type { VoiceBasedChannel } from "discord.js"

/** Counts non-bot members in a voice channel (used for alone-in-VC cleanup and session restore). */
export function countHumanMembers(voiceChannel: VoiceBasedChannel): number {
    return voiceChannel.members.filter((m) => !m.user.bot).size
}
