import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from "discord.js"
import type BotClient from "../../lib/BotClient.js"
import type { ChatInputCommandInteraction } from "discord.js"
import {
    companionKeyLengthOk,
    companionOriginFromEnv,
    lavalinkNodeSummary,
    lavalinkRestOriginFromEnv,
    probeHttpReachable,
    probePostgres,
    STACK_STATUS_TIMEOUT_MS,
    ytCipherOriginFromEnv,
    type HttpProbeResult,
} from "../../util/stackStatus.js"

function formatProbe(result: HttpProbeResult): string {
    if (result.ok) {
        const status = result.status != null ? ` HTTP ${result.status}` : ""
        return `up${status}`
    }
    return `down${result.error ? ` (${result.error})` : ""}`
}

export default {
    data: new SlashCommandBuilder()
        .setName("stackstatus")
        .setDescription("Probe companion, Lavalink, yt-cipher, and Postgres (Developer Only)"),
    async execute(interaction: ChatInputCommandInteraction, client: BotClient): Promise<unknown> {
        const ownerId = process.env.OWNER_ID
        if (!ownerId) {
            client.error(
                "[StackStatusCmd] Developer ID is not configured as OWNER_ID in environment variables!"
            )
            return interaction.reply({
                content: "Command configuration error: Developer ID not set.",
                flags: [MessageFlags.Ephemeral],
            })
        }
        if (interaction.user.id !== ownerId) {
            client.debug(
                `[StackStatusCmd] Denied access to user ${interaction.user.tag} (${interaction.user.id})`
            )
            return interaction.reply({
                content: "Sorry, this command can only be used by the bot developer.",
                flags: [MessageFlags.Ephemeral],
            })
        }

        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] })
        client.debug(`[StackStatusCmd] Probe started by ${interaction.user.tag}`)

        const companionUrl = companionOriginFromEnv()
        const cipherUrl = ytCipherOriginFromEnv()
        const lavalinkUrl = lavalinkRestOriginFromEnv()
        const lavalinkPassword = process.env.LAVALINK_PASSWORD ?? ""

        const [companion, cipher, lavalinkRest, postgres] = await Promise.all([
            probeHttpReachable(companionUrl),
            probeHttpReachable(cipherUrl),
            probeHttpReachable(`${lavalinkUrl}/version`, STACK_STATUS_TIMEOUT_MS, {
                Authorization: lavalinkPassword,
            }),
            probePostgres(),
        ])

        const nodes = lavalinkNodeSummary(client.lavalink)
        const keyOk = companionKeyLengthOk(process.env.INVIDIOUS_COMPANION_KEY ?? "")

        const embed = new EmbedBuilder()
            .setColor(
                companion.ok && cipher.ok && lavalinkRest.ok && postgres.ok && nodes.connected > 0
                    ? 0x57f287
                    : 0xfee75c
            )
            .setTitle("Stack status")
            .addFields(
                {
                    name: "invidious-companion",
                    value: formatProbe(companion),
                    inline: false,
                },
                {
                    name: "Lavalink",
                    value: `${formatProbe(lavalinkRest)} · nodes ${nodes.connected}/${nodes.nodeCount} connected`,
                    inline: false,
                },
                { name: "yt-cipher", value: formatProbe(cipher), inline: false },
                { name: "Postgres", value: formatProbe(postgres), inline: false },
                {
                    name: "INVIDIOUS_COMPANION_KEY",
                    value: keyOk ? "length 16 alphanumeric" : "missing or not 16 alphanumeric",
                    inline: false,
                }
            )
            .setTimestamp()

        client.debug(
            `[StackStatusCmd] companion=${companion.ok} lavalinkRest=${lavalinkRest.ok} nodes=${nodes.connected}/${nodes.nodeCount} cipher=${cipher.ok} postgres=${postgres.ok} keyOk=${keyOk}`
        )
        return interaction.editReply({ embeds: [embed] })
    },
}
