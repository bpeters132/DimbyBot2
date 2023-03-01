import { interactions } from '../lib/loadCommands.js';

export default async (client) => {
    console.log('Loading event on interactionCreate');
    client.on('interactionCreate', async interaction => {
        console.log('Starting interaction');
        if (!interaction.isChatInputCommand()) return;

        interactions.forEach(slashMessage => {
            if (interaction.commandName === slashMessage.name) {
                interaction.reply('I apologize, but I am currently broken in every way imaginable, my creator is currently prioritizing a full feature update to fix common issues and slow performance. Please keep me around for good tunes when the update is here! <3');
                // slashMessage.run(client, interaction);
                return;
            }
        });
    });
};