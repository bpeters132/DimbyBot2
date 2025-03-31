import { Client, GatewayIntentBits } from 'discord.js';
import loadEvents from './util/loadEvents.js';
import Logger from './lib/Logger.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

dotenv.config();

const token = process.env.TOKEN;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates]
});

async function main() {
    try {
        loadEvents(client);
        client.logger = new Logger(path.join(__dirname, '..', 'logs.log'));
        client.login(token);
    } catch (err) {
        console.error(err);
    }
}

main();