import onError from '../events/onError.js';
import onInteractionCreate from '../events/onInteractionCreate.js';
import onReady from '../events/onReady.js';

export default async (client) => {
    onReady(client);
    onError(client);
    onInteractionCreate(client);
};
