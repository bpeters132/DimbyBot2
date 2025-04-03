import { LavalinkManager } from 'lavalink-client';
import { nodes } from '../config.js';

/**
 * 
 * @param {import('./BotClient.js').default} client 
 */
export default function createLavalinkManager(client) {

    const manager = new LavalinkManager({
        nodes,
        sendToShard: (guildId, payload) => client.guilds.cache.get(guildId)?.shard?.send(payload),
        autoSkip: true,
        client:{
            id: process.env.APP_ID,
            username: 'DimbyBot' // TODO: add this to ENV
        }
    });
    return manager;
}