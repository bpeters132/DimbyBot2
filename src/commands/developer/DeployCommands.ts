import {
    SlashCommandBuilder,
    REST,
    Routes,
    MessageFlags,
    type RESTPostAPIChatInputApplicationCommandsJSONBody,
} from "discord.js"
import type { ChatInputCommandInteraction } from "discord.js"
import type BotClient from "../../lib/BotClient.js"
import fs from "fs"
import path from "path"

const __dirname = import.meta.dirname

async function loadCommands(
    client: BotClient,
    dir: string,
    commands: RESTPostAPIChatInputApplicationCommandsJSONBody[] = []
): Promise<RESTPostAPIChatInputApplicationCommandsJSONBody[]> {
    const dirents = await fs.promises.readdir(dir, { withFileTypes: true })
    for (const dirent of dirents) {
        const resPath = path.resolve(dir, dirent.name)
        if (dirent.isDirectory()) {
            await loadCommands(client, resPath, commands)
        } else if (dirent.isFile() && dirent.name.endsWith(".js")) {
            try {
                const commandModule = (await import(`file://${resPath}`)) as {
                    default?: { data: SlashCommandBuilder }
                }
                if (
                    commandModule.default &&
                    commandModule.default.data instanceof SlashCommandBuilder
                ) {
                    commands.push(commandModule.default.data.toJSON())
                    client.debug(`[DeployCmd] Loaded command: ${commandModule.default.data.name}`)
                } else {
                    client.warn(
                        `[DeployCmd] Command file ${resPath} is missing a default export or valid 'data' property.`
                    )
                }
            } catch (error: unknown) {
                client.error(`[DeployCmd] Error loading command file ${resPath}:`, error)
            }
        }
    }
    return commands
}

export default {
    data: new SlashCommandBuilder()
        .setName("deploycommands")
        .setDescription("Deploys/refreshes slash commands (Developer Only)")
        .addSubcommand((subcommand) =>
            subcommand
                .setName("deployglobal")
                .setDescription("Deploy/refresh slash commands globally")
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("deploylocal")
                .setDescription("Deploy/refresh slash commands to a single guild")
                .addStringOption((option) =>
                    option
                        .setName("guildid")
                        .setDescription("Target guild ID (defaults to current guild)")
                        .setRequired(false)
                )
        ),
    async execute(interaction: ChatInputCommandInteraction, client: BotClient): Promise<unknown> {
        const ownerId = process.env.OWNER_ID
        if (!ownerId) {
            client.error(
                "[DeployCmd] Developer ID is not configured as OWNER_ID in environment variables!"
            )
            return interaction.reply({
                content: "Command configuration error: Developer ID not set.",
                flags: [MessageFlags.Ephemeral],
            })
        }
        if (interaction.user.id !== ownerId) {
            client.debug(
                `[DeployCmd] Denied access to user ${interaction.user.tag} (${interaction.user.id})`
            )
            return interaction.reply({
                content: "Sorry, this command can only be used by the bot developer.",
                flags: [MessageFlags.Ephemeral],
            })
        }

        client.debug(`[DeployCmd] Command invoked by developer ${interaction.user.tag}`)
        await interaction.deferReply({
            flags: [MessageFlags.Ephemeral],
        })

        try {
            const commands: RESTPostAPIChatInputApplicationCommandsJSONBody[] = []
            const commandsPath = path.join(__dirname, "..", "..", "commands")
            await loadCommands(client, commandsPath, commands)

            if (commands.length === 0) {
                await interaction.editReply("⚠️ No command files found or loaded.")
                return
            }

            const token = process.env.BOT_TOKEN
            if (!token) {
                await interaction.editReply("❌ BOT_TOKEN is not set.")
                return
            }
            const rest = new REST().setToken(token)

            const subcommand = interaction.options.getSubcommand()
            if (subcommand === "deploylocal") {
                const targetGuildId =
                    interaction.options.getString("guildid") || interaction.guildId
                if (!targetGuildId) {
                    await interaction.editReply("❌ Guild ID is required for local deploys.")
                    return
                }
                client.debug(
                    `[DeployCmd] Refreshing ${commands.length} application (/) commands for guild ${targetGuildId}.`
                )
                await rest.put(
                    Routes.applicationGuildCommands(interaction.client.user.id, targetGuildId),
                    {
                        body: commands,
                    }
                )
                await interaction.editReply(
                    `✅ Successfully reloaded ${commands.length} application (/) commands for guild ${targetGuildId}.`
                )
                client.info(
                    `[DeployCmd] Successfully deployed ${commands.length} commands to guild ${targetGuildId} by ${interaction.user.tag}`
                )
            } else {
                client.debug(
                    `[DeployCmd] Refreshing ${commands.length} application (/) commands globally.`
                )
                await rest.put(Routes.applicationCommands(interaction.client.user.id), {
                    body: commands,
                })
                await interaction.editReply(
                    `✅ Successfully reloaded ${commands.length} application (/) commands globally.`
                )
                client.info(
                    `[DeployCmd] Successfully deployed ${commands.length} commands globally by ${interaction.user.tag}`
                )
            }
        } catch (error: unknown) {
            client.error("[DeployCmd] Failed to deploy commands:", error)
            const em = error instanceof Error ? error.message : String(error)
            await interaction.editReply(
                `❌ Failed to reload application commands. Check console for details. Error: ${em}`
            )
        }
    },
}
