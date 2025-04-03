import { Routes } from 'discord.js';
import { REST } from '@discordjs/rest';
import dotenv from 'dotenv';
dotenv.config();

const appID = process.env.APP_ID;
const token = process.env.TOKEN;
const rest = new REST({ version: '10' }).setToken(token);

// for global commands
rest.put(Routes.applicationCommands(appID), { body: [] })
    .then(() => console.log('Successfully deleted all global commands.'))
    .catch(console.error);