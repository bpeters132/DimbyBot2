import { Client, GatewayIntentBits } from 'discord.js';
import loadEvents from './lib/loadEvents.js';
import dotenv from 'dotenv';
// import deploycommands from './lib/deployCommands.js';
import deployCommandsDev from './lib/deployCommandsDev.js';
dotenv.config();

const token = process.env.TOKEN;

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

async function main() {
    try {
        loadEvents(client);
        // deployCommands();
        deployCommandsDev();
        client.login(token);
    } catch (err) {
        console.error(err);
    }
}

main();