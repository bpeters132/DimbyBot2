import { Routes } from 'discord.js';
import { REST } from '@discordjs/rest';
import { commands } from '../util/loadCommands.js';
import dotenv from 'dotenv';
dotenv.config();

(async () => {
    const appID = process.env.APP_ID;
    const devGuildID = process.env.DEV_SERVER_ID;
    const token = process.env.TOKEN;

    const rest = new REST({ version: '10' }).setToken(token);

    console.log('Started refreshing dev application commands');

    await rest.put(Routes.applicationGuildCommands(appID, devGuildID), { body: commands })
        .then(() => console.log('Successfully registered dev application commands.'))
        .catch(console.error);
})();

