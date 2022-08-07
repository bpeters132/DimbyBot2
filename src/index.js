import { Client, GatewayIntentBits } from 'discord.js';
import { Player } from 'discord-player';
import musicPlayerEvents from './events/musicPlayerEvents.js';
import loadEvents from './lib/loadEvents.js';
import dotenv from 'dotenv';
// import deployCommands from './lib/deployCommands.js';
import deployCommandsDev from './lib/deployCommandsDev.js';
dotenv.config();

const token = process.env.TOKEN;

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates]
});

async function main() {
    try {
        loadEvents(client);
        client.player = new Player(client);
        musicPlayerEvents(client.player);
        // deployCommands();
        deployCommandsDev();
        client.login(token);
    } catch (err) {
        console.error(err);
    }
}

main();