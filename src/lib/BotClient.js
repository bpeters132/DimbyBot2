import { Client, GatewayIntentBits } from 'discord.js';
import { Manager } from 'lavacord';
import loadEvents from '../util/loadEvents.js';
import Logger from './Logger.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import { nodes } from '../config.js';

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

        // Initialize Lavacord Manager



    }


    /**
     * Starts the bot, loading events and logging in to Discord
     * @param {string} token - Discord bot token (default from .env)
     */
    async start(token = process.env.TOKEN) {
        try {
            // Load all event listeners
            loadEvents(this);

            // Log into Discord
            await this.login(token);

            const shardCount = parseInt(process.env.SHARD_COUNT) || 1;
            
            this.manager = new Manager(nodes, {
                user: this.user.id,
                shards: shardCount,
                send: (id, packet) => {
                    this.guilds.cache.get(id)?.shard.send(packet);
                }
            });

            // Catch lavacord manager errors
            this.manager.on('error', (error, node) => {
                this.logger.error('LavaCordManager error: ', error, ' from node ', node);
            });

            // Connect Lavalink Nodes
            try {
                await this.manager.connect();
                this.logger.log('Connected to Lavalink');
            } catch (error) {
                this.logger.log('There was an error connecting to the lavalink nodes');
                this.logger.error(error);
            }

        } catch (err) {
            this.logger.error(err);
        }
    }
}

export default BotClient;
