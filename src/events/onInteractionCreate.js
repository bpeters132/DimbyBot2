import { interactions } from '../util/loadCommands.js';

/**
 * @param {import('../lib/BotClient.js').default} client
 */
export default async (client) => {
    client.logger.log('Loaded event on interactionCreate');

    client.on('interactionCreate', async interaction => {
        console.log('Starting interaction');

        if (!interaction.isChatInputCommand()) return;

        const command = interactions.find(cmd => cmd.data.name === interaction.commandName);
        if (!command) return;

        try {
            await command.run(client, interaction);
        } catch (error) {
            console.error(`Error running command ${interaction.commandName}:`, error);
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: 'There was an error executing this command.'});
            } else {
                await interaction.reply({ content: 'There was an error executing this command.'});
            }
        }
    });
};
