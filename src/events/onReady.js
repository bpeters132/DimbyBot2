import { ActivityType } from 'discord.js';

export default async (client) => {
    let serverCount = await client.guilds.cache.size;
    console.log('Loading event on ready');
    client.on('ready', () => {
        console.log(`Logged in as ${client.user.tag}! (${client.user.id})`);
        client.user.setActivity('the people', {type: ActivityType.Watching});
        setInterval(async () => {
            let serverCount = await client.guilds.cache.size;
            client.user.setActivity('the people', {type: ActivityType.Watching});
        }, 21600 * 1000);
    });
};