/**
 * @param {import('../lib/BotClient.js').default} client
 * @param {import('discord.js').Interaction} interaction
 */
export default (client) => {
  client.on("interactionCreate", async (interaction) => {
    // 1. Check if it's a Chat Input Command (Slash Command)
    if (!interaction.isChatInputCommand()) {
      // logger.debug(`Ignoring non-chat-input interaction: ${interaction.type}`);
      return
    }

    // 2. Get the command name
    const commandName = interaction.commandName

    // 3. Retrieve the command object from the client's collection
    // This relies on loadCommands having populated client.commands
    const command = client.commands.get(commandName)

    // 4. Handle Command Not Found
    if (!command) {
      client.error(`No command matching "${commandName}" was found in client.commands.`)
      try {
        // Inform the user the command doesn't exist (or wasn't loaded)
        await interaction.reply({
          content: `❌ Error: Command "${commandName}" not found!`,
          ephemeral: true,
        })
      } catch (replyError) {
        // Log if we can't even send the error reply
        client.error(`Failed to send 'command not found' reply for ${commandName}:`, replyError)
      }
      return // Stop execution if command not found
    }

    // 5. Execute the Command
    try {
      client.log(
        `Executing command "${commandName}" for user ${interaction.user.tag} (${interaction.user.id}) in guild ${interaction.guild?.name ?? "DM"} (${interaction.guild?.id ?? "N/A"})`
      )
      // Call the execute function stored in the command object
      // Pass the client and interaction to the command
      await command.execute(client, interaction)
    } catch (error) {
      client.error(`Error executing command "${commandName}":`, error)

      // Attempt to inform the user about the error
      try {
        // Check if we already replied or deferred the reply
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({
            content: "❌ There was an error while executing this command!",
            ephemeral: true,
          })
        } else {
          await interaction.reply({
            content: "❌ There was an error while executing this command!",
            ephemeral: true,
          })
        }
      } catch (replyError) {
        // Log if sending the error notification fails
        client.error(`Failed to send execution error reply for ${commandName}:`, replyError)
      }
    }
  })
}
