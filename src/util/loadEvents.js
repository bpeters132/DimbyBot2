import onRaw from '../events/onRaw.js';
import onError from '../events/onError.js';
import onInteractionCreate from '../events/onInteractionCreate.js';
import onReady from '../events/onReady.js';
import lavaManagerEvents from '../events/lavaManagerEvents.js';
import lavaNodeEvents from '../events/lavaNodeEvents.js';

/**
 * @param {import('../lib/BotClient.js').default} client
 */
export default async (client) => {
    onRaw(client);
    onError(client);
    onInteractionCreate(client);
    onReady(client);
    lavaManagerEvents(client);
    lavaNodeEvents(client);
};
