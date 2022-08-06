import { Routes } from 'discord.js';
import { REST } from '@discordjs/rest';
import { commands } from './src/lib/loadCommands.js';

const appID = '';
const token = '';
const guildServerId = '';

const rest = new REST({ version: '10' }).setToken(token);

console.log('Started refreshing application commands');

// rest.put(Routes.applicationCommands(appID), { body: commands })
//     .then(() => console.log('Successfully registered application commands.'))
//     .catch(console.error);

// rest.put(Routes.applicationGuildCommands(appID, guildServerId), { body: commands })
//     .then(() => console.log('Successfully registered application commands.'))
//     .catch(console.error);
