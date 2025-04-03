import { Client, GatewayIntentBits } from 'discord.js';
import loadEvents from '../util/loadEvents.js';
import Logger from './Logger.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import createLavalinkManager from './LavaLinkManager.js';

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

        // Build lavalink manager
        this.lavalink = createLavalinkManager(this);

        // Load all event listeners
        loadEvents(this);

    }

    /**
     * Starts the bot, loading events and logging in to Discord
     * @param {string} token - Discord bot token (default from .env)
     */
    async start(token = process.env.TOKEN) {
        try {            
            // Log into Discord
            await this.login(token);
        } catch (err) {
            this.logger.error(err);
        }
    }
}

export default BotClient;
