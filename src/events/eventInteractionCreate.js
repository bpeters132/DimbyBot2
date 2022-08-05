import { interactions } from '../lib/loadCommands.js';

export default async (client) => {
    client.on('interactionCreate', async interaction => {
        if (!interaction.isChatInputCommand()) return;
        interactions.forEach(element => {
            if (interaction.commandName === element.name) {
                element.run(interaction);
            } else {
                interaction.reply('something went wrong');
            }
        });
    });
};