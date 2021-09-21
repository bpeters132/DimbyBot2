const fs = require('fs');
const {Client, Intents, Collection} = require('discord.js');
const { SlashCreator, GatewayServer } = require('slash-create');
const { Player } = require('discord-player');
const {registerPlayerEvents} = require('./playerEvents');
const logIt = require('./scripts/logIt');
const path = require('path');

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
const events = fs.readdirSync('./events').filter(file => file.endsWith('.js'));

// Load Event Files
for (const file of events) {
    console.log(`Loading discord.js event ${file}`);
    const event = require(`./events/${file}`);
    client.on(file.split('.')[0], event.bind(null, client));
}

// Create Music Player
client.player = new Player(client);
registerPlayerEvents(client.player);

const creator = new SlashCreator({
    applicationID: process.env.BOT_APP_ID,
    token: process.env.TOKEN,
});

//Command Registering/Syncing
creator
    .withServer(
        new GatewayServer(
            (handler) => client.ws.on('INTERACTION_CREATE', handler)
        )
    )
    .registerCommandsIn(path.join(__dirname, 'musicCommands'));
    
if (process.env.DISCORD_GUILD_ID) creator.syncCommandsIn(process.env.DISCORD_GUILD_ID);
else creator.syncCommands();

// Login
client.login(process.env.TOKEN).catch((err) => {
    console.log(err);
    logIt('error', err);
});

module.exports.client = client;
module.exports.creator = creator;