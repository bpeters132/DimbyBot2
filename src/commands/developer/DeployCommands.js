import { SlashCommandBuilder, REST, Routes } from "discord.js"
import fs from "fs"
import path from "path"

// Helper function to recursively load command files
// Adjust this if your command loading logic is different!
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
    .setDescription("Deploys/refreshes slash commands globally (Developer Only)"),
  /**
   * @param {import('../../lib/BotClient.js').default} client
   * @param {import('discord.js').CommandInteraction} interaction
   */
  async execute(interaction, client) {
    // --- Developer Check ---
    const ownerId = process.env.OWNER_ID
    if (!ownerId) {
      client.error("[DeployCmd] Developer ID is not configured as OWNER_ID in environment variables!")
      return interaction.reply({ content: "Command configuration error: Developer ID not set.", ephemeral: true })
    }
    if (interaction.user.id !== ownerId) {
      client.debug(`[DeployCmd] Denied access to user ${interaction.user.tag} (${interaction.user.id})`)
      return interaction.reply({ content: "Sorry, this command can only be used by the bot developer.", ephemeral: true })
    }
    // --- End Developer Check ---

    client.debug(`[DeployCmd] Command invoked by developer ${interaction.user.tag}`)
    await interaction.deferReply({ ephemeral: true })

    try {
      const commands = []
      // Start loading from the base commands directory
      const commandsPath = path.join(client.dirname, 'commands') 
      await loadCommands(commandsPath, commands)

      if (commands.length === 0) {
          await interaction.editReply("⚠️ No command files found or loaded.")
          return
      }

      const rest = new REST().setToken(client.token)

      client.debug(`[DeployCmd] Refreshing ${commands.length} application (/) commands globally.`)
      await rest.put(
        Routes.applicationCommands(client.user.id),
        { body: commands },
      )

      await interaction.editReply(`✅ Successfully reloaded ${commands.length} application (/) commands globally.`)
      client.info(`[DeployCmd] Successfully deployed ${commands.length} commands globally by ${interaction.user.tag}`)

    } catch (error) {
      client.error("[DeployCmd] Failed to deploy commands:", error)
      await interaction.editReply(`❌ Failed to reload application commands. Check console for details. Error: ${error.message}`)
    }
  },
} 