// src/bot/events/interactionCreate.js
module.exports = {
    name: 'interactionCreate',
    async execute(interaction, client) {
      if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;
        try {
          await command.execute(interaction, client);
        } catch (error) {
          console.error(error);
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: 'There was an error executing that command.', ephemeral: true });
          } else {
            await interaction.reply({ content: 'There was an error executing that command.', ephemeral: true });
          }
        }
      } 
    }
  };
  