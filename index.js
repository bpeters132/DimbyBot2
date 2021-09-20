const fs = require("fs");
const Discord = require("discord.js");
const { SlashCreator, GatewayServer } = require('slash-create');
const { Player } = require('discord-player');
const { registerPlayerEvents } = require('./playerEvents');
const logIt = require('./scripts/logIt')
const path = require('path')

require("dotenv").config();

const client = new Discord.Client({
    intents: [
        Discord.Intents.FLAGS.GUILDS,
        Discord.Intents.FLAGS.GUILD_MESSAGES,
        Discord.Intents.FLAGS.GUILD_VOICE_STATES,
    ],
    disableMentions: 'everyone'
});

client.commands = new Discord.Collection();
client.cooldowns = new Discord.Collection();
const commandFolders = fs.readdirSync("./commands");

// Register Commands
for (const folder of commandFolders) {
    const commandFiles = fs
        .readdirSync(`./commands/${folder}`)
        .filter((file) => file.endsWith(".js"));
    for (const file of commandFiles) {
        const command = require(`./commands/${folder}/${file}`);
        client.commands.set(command.name, command);
    }
}

const events = fs.readdirSync('./events').filter(file => file.endsWith('.js'));

// Event Handling
for (const file of events) {
    console.log(`Loading discord.js event ${file}`);
    const event = require(`./events/${file}`);
    client.on(file.split(".")[0], event.bind(null, client));
};

// Music Handling
client.player = new Player(client, {
    ytdlOptions: {
        requestOptions: {
            headers: {
                cookie: "AFmmF2swRgIhAMEiqwAZqb6eu3FIIeXeze0hA4FvTO3n7nJC2HXhXw9GAiEA0xWG4G-mcNULlvKOqzIgsU6r6ODVyZyZtO3vwUtlqMM:QUQ3MjNmeTFKeU9qb1o0WW53UDFsUWdrTFVxZDhwSk9KUDFJMnRtX1hWcWhIOWw5QUJuc0Q1dGxqSzM4Vy0zNlhta0pBdTFPeEtOTmVyUWNXY2kwejRxNFBGaEJ3elNzR3Rxd0pGdFdRUlRnSlZ2MXdRUXV2dm9rSDdQaGJpNDdzTUhPNG9FbkZxaGlGb2hmSmpiRXgtZV9yVEdoWldpaGRQclVPaW1wYjdCMGg5MG1mNUl0SGVsWW5HM1RSZ0FCUE1tS1E0cVpPNlUzOElYZ05ROFlKSVJtcXN4WHpfckRYQW5hR0xOWExCOV9oaDFPUnRMVllsclhMeGZITzlDRnBLUi1nVTV0Smtuaw=="
            }
        }
    }
});
registerPlayerEvents(client.player);

const creator = new SlashCreator({
    applicationID: process.env.DISCORD_CLIENT_ID,
    token: process.env.TOKEN,
});

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}! (${client.user.id})`);
    client.user.setActivity(`${process.env.PREFIX}help | Serving the People`);
});

// Music Command Registering/Syncing
creator
    .withServer(
        new GatewayServer(
            (handler) => client.ws.on('INTERACTION_CREATE', handler)
        )
    )
    .registerCommandsIn(path.join(__dirname, 'musicCommands'))

if (process.env.DISCORD_GUILD_ID) creator.syncCommandsIn(process.env.DISCORD_GUILD_ID);
else creator.syncCommands();


client.on("error", console.error);

client.login(process.env.TOKEN).catch((err) => {
    console.log(err)
    logIt("error", err)
});

module.exports.client = client;
module.exports.creator = creator;