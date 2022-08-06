import { interactions } from '../lib/loadCommands.js';

export default async (client) => {
    console.log('Loading event on interactionCreate');
    client.on('interactionCreate', async interaction => {
        if (!interaction.isChatInputCommand()) return;

        interactions.forEach(element => {
            if (interaction.commandName === element.name) {
                element.run(client, interaction);
                return;
            }
        });
    });
};