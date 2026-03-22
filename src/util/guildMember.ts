import type { ChatInputCommandInteraction, GuildMember } from "discord.js"

/**
 * Guild-only slash commands: resolve {@link GuildMember} for voice/state checks.
 * Casts from the interaction payload; the bot expects cached members in typical guild use.
 */
export function guildMemberFromInteraction(
  interaction: ChatInputCommandInteraction
): GuildMember | null {
  if (!interaction.inCachedGuild()) return null
  const m = interaction.member
  if (!m) return null
  return m as GuildMember
}
