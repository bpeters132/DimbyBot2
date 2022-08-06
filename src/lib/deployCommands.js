import { Routes } from 'discord.js';
import { REST } from '@discordjs/rest';
import { commands } from './loadCommands.js';

export default async () => {
    const appID = process.env.APP_ID;
    const token = process.env.TOKEN;

    const rest = new REST({ version: '10' }).setToken(token);

    console.log('Started refreshing application commands');

    await rest.put(Routes.applicationCommands(appID), { body: commands })
        .then(() => console.log('Successfully registered application commands.'))
        .catch(console.error);
};

