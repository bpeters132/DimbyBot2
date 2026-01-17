import { SlashCommandBuilder, REST, Routes, MessageFlags } from "discord.js"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Recursively loads command files from a directory and its subdirectories.
 * @param {string} dir The directory to load commands from.
 * @param {Array<object>} commands An array to store the loaded command data.
 * @returns {Promise<Array<object>>} A promise that resolves with an array of command data objects.
 */
async function loadCommands(dir, commands = []) {
    const dirents = fs.readdirSync(dir, { withFileTypes: true })
    for (const dirent of dirents) {
        const resPath = path.resolve(dir, dirent.name)
        if (dirent.isDirectory()) {
            await loadCommands(resPath, commands)
        } else if (dirent.isFile() && (dirent.name.endsWith('.js') || dirent.name.endsWith('.ts'))) {
            try {
                // Adjust the dynamic import path based on your project structure if needed
                const commandModule = await import(`file://${resPath}`)
                if (commandModule.default && commandModule.default.data instanceof SlashCommandBuilder) {
                    commands.push(commandModule.default.data.toJSON())
                    console.log(`[DeployCmd] Loaded command: ${commandModule.default.data.name}`)
                } else {
                    console.warn(`[DeployCmd] Command file ${resPath} is missing a default export or valid 'data' property.`)
                }
            } catch (error) {
                console.error(`[DeployCmd] Error loading command file ${resPath}:`, error)
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
  /**
   * @param {import('../../lib/BotClient.js').default} client
   * @param {import('discord.js').CommandInteraction} interaction
   */
  async execute(interaction, client) {
    // --- Developer Check ---
    const ownerId = process.env.OWNER_ID
    if (!ownerId) {
      client.error("[DeployCmd] Developer ID is not configured as OWNER_ID in environment variables!")
      return interaction.reply({ 
        content: "Command configuration error: Developer ID not set.", 
        flags: [MessageFlags.Ephemeral] 
      })
    }
    if (interaction.user.id !== ownerId) {
      client.debug(`[DeployCmd] Denied access to user ${interaction.user.tag} (${interaction.user.id})`)
      return interaction.reply({ 
        content: "Sorry, this command can only be used by the bot developer.", 
        flags: [MessageFlags.Ephemeral] 
      })
    }
    // --- End Developer Check ---

    client.debug(`[DeployCmd] Command invoked by developer ${interaction.user.tag}`)
    await interaction.deferReply({ 
      flags: [MessageFlags.Ephemeral] 
    })

    try {
      const commands = []
      // Start loading from the base commands directory
      const commandsPath = client.dirname
        ? path.join(client.dirname, "commands")
        : path.resolve(__dirname, "..")
      await loadCommands(commandsPath, commands)

      if (commands.length === 0) {
          await interaction.editReply("⚠️ No command files found or loaded.")
          return
      }

      const rest = new REST().setToken(client.token)

      const subcommand = interaction.options.getSubcommand()
      if (subcommand === "deploylocal") {
        const targetGuildId = interaction.options.getString("guildid") || interaction.guildId
        if (!targetGuildId) {
          await interaction.editReply("❌ Guild ID is required for local deploys.")
          return
        }
        client.debug(
          `[DeployCmd] Refreshing ${commands.length} application (/) commands for guild ${targetGuildId}.`
        )
        await rest.put(
          Routes.applicationGuildCommands(client.user.id, targetGuildId),
          { body: commands },
        )
        await interaction.editReply(
          `✅ Successfully reloaded ${commands.length} application (/) commands for guild ${targetGuildId}.`
        )
        client.info(
          `[DeployCmd] Successfully deployed ${commands.length} commands to guild ${targetGuildId} by ${interaction.user.tag}`
        )
      } else {
        client.debug(`[DeployCmd] Refreshing ${commands.length} application (/) commands globally.`)
        await rest.put(
          Routes.applicationCommands(client.user.id),
          { body: commands },
        )
        await interaction.editReply(
          `✅ Successfully reloaded ${commands.length} application (/) commands globally.`
        )
        client.info(
          `[DeployCmd] Successfully deployed ${commands.length} commands globally by ${interaction.user.tag}`
        )
      }

    } catch (error) {
      client.error("[DeployCmd] Failed to deploy commands:", error)
      await interaction.editReply(`❌ Failed to reload application commands. Check console for details. Error: ${error.message}`)
    }
  },
}
