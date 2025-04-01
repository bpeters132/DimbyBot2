import { Client, GatewayIntentBits } from 'discord.js';
import loadEvents from '../util/loadEvents.js';
import Logger from './Logger.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Custom BotClient class that extends the base Discord Client
class BotClient extends Client {
    constructor() {
        // Initialize the Discord Client with required gateway intents
        super({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildVoiceStates
            ]
        });

        // Create and attach a custom logger instance to the bot
        this.logger = new Logger(path.join(__dirname, '../..', 'logs.log'));

    }

    /**
     * Starts the bot, loading events and logging in to Discord
     * @param {string} token - Discord bot token (default from .env)
     */
    async start(token = process.env.TOKEN) {
        try {
            // Load all event listeners (messageCreate, interactionCreate, etc.)
            loadEvents(this);

            // Log the bot in with the provided token
            await this.login(token);

        } catch (err) {
            // Log any startup errors using the custom logger
            this.logger.error(err);
        }
    }
}

export default BotClient;
