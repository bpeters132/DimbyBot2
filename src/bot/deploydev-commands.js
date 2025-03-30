// src/bot/deploydev-commands.js
require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  if (command.data) {
    commands.push(command.data.toJSON());
  }
}

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

if (!process.env.DEV_GUILD_ID) {
  console.error('DEV_GUILD_ID is not defined in your .env file.');
  process.exit(1);
}

rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.DEV_GUILD_ID), { body: commands })
  .then(() => console.log('Successfully registered guild commands for rapid testing.'))
  .catch(console.error);
