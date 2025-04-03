/**
 * @param {import('../lib/BotClient').default} client
 */
export default async (client) => {
    client.logger.log('Loaded event on raw');
    client.on('raw', data => {
        client.lavalink.sendRawData(data);
    });
};