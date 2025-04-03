
/**
 * @param {import('../lib/BotClient').default} client
 */
export default async (client) => {
    client.logger.log('Loaded event error');
    client.on('error', (err) => {
        client.logger.log(err);
    });
};