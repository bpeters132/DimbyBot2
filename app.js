const fs = require('fs');
const {Client, Intents, Collection} = require('discord.js');
const { Player } = require('discord-player');
const {registerPlayerEvents} = require('./playerEvents');

require('dotenv').config();

const client = new Client({
    intents: [
        Intents.FLAGS.GUILDS,
        Intents.FLAGS.GUILD_MESSAGES,
        Intents.FLAGS.GUILD_VOICE_STATES,
    ],
    disableMentions: 'everyone'
});

client.commands = new Collection();
client.cooldowns = new Collection();
const commandFolders = fs.readdirSync('./commands');

// Register Commands
for (const folder of commandFolders) {
    const commandFiles = fs
        .readdirSync(`./commands/${folder}`)
        .filter((file) => file.endsWith('.js'));
    for (const file of commandFiles) {
        const command = require(`./commands/${folder}/${file}`);
        client.commands.set(command.name, command);
    }
}

// Read Event Files
const eventFiles = fs.readdirSync('./events').filter(file => file.endsWith('.js'));

// Load Event Files
for (const file of eventFiles) {
    console.log(`Loading discord.js event file ${file}`);
    const event = require(`./events/${file}`);
    const eventName = file.split('.')[0];
    
    // Bind client events to the respective code
    client.on(eventName, event.bind(null, client));
}

// Create Music Player
client.player = new Player(client);
registerPlayerEvents(client.player);

// Login
client.login(process.env.TOKEN).catch((err) => {
    console.log(err);
});

module.exports.client = client;