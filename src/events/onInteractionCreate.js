import { interactions } from '../util/loadCommands.js';

export default async (client) => {
    console.log('Loading event on interactionCreate');
    client.on('interactionCreate', async interaction => {
        console.log('Starting interaction');
        if (!interaction.isChatInputCommand()) return;

        interactions.forEach(slashMessage => {
            if (interaction.commandName === slashMessage.name) {
                slashMessage.run(client, interaction);
                return;
            }
        });
    });
};