/**
 * Discord CDN guild icon URL (PNG, size 128), or null when the guild has no icon hash.
 * Shared by guild-list and voice-context API responses.
 */
export function discordGuildIconUrl(
    guildId: string,
    icon: string | null | undefined
): string | null {
    if (!icon) return null
    return `https://cdn.discordapp.com/icons/${guildId}/${icon}.png?size=128`
}
