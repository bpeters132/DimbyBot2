import { ActivityType } from 'discord.js';

/**
 * @param {import('../lib/BotClient').default} client
 */
export default async (client) => {
    client.logger.log('Loaded event on ready');
    client.on('ready', () => {

        client.lavalink.init(client.user); // init lavalink

        console.log(`Logged in as ${client.user.tag}! (${client.user.id})`);
        client.user.setActivity('over the people', {type: ActivityType.Watching});
        setInterval(async () => {
            client.user.setActivity('over the people', {type: ActivityType.Watching});
        }, 21600 * 1000);
    });
};