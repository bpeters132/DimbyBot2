import { Routes } from 'discord.js';
import { REST } from '@discordjs/rest';
import dotenv from 'dotenv';
dotenv.config();

const appID = process.env.APP_ID;
const devServerID = process.env.DEV_SERVER_ID;
const token = process.env.TOKEN;
const rest = new REST({ version: '10' }).setToken(token);

// for guild-based commands
rest.put(Routes.applicationGuildCommands(appID, devServerID), { body: [] })
    .then(() => console.log('Successfully deleted all guild commands.'))
    .catch(console.error);

// for global commands
rest.put(Routes.applicationCommands(appID), { body: [] })
    .then(() => console.log('Successfully deleted all application commands.'))
    .catch(console.error);