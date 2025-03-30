// src/bot/bot.js
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const { Player } = require('discord-player');
const path = require('path');
const fs = require('fs');

function startBot() {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildMessages
    ]
  });

  // Load slash commands
  client.commands = new Collection();
  const commandsPath = path.join(__dirname, 'commands');
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
  for (const file of commandFiles) {
    const command = require(path.join(commandsPath, file));
    if (command.data && command.execute) {
      client.commands.set(command.data.name, command);
    }
  }

  // Initialize discord-player with your Lavalink v3 node
  client.player = new Player(client, {
    nodes: [{
      host: process.env.LAVALINK_HOST,
      port: Number(process.env.LAVALINK_PORT),
      password: process.env.LAVALINK_PASSWORD,
      secure: false
    }]
  });

  // Load other event handlers
  const eventsPath = path.join(__dirname, 'events');
  const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));
  for (const file of eventFiles) {
    const event = require(path.join(eventsPath, file));
    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args, client));
    } else {
      client.on(event.name, (...args) => event.execute(...args, client));
    }
  }

  client.login(process.env.DISCORD_TOKEN);
}

module.exports = { startBot };
