import eventError from '../events/eventError.js';
import eventInteractionCreate from '../events/eventInteractionCreate.js';
import eventReady from '../events/eventReady.js';

export default async (client) => {
    eventReady(client);
    eventError(client);
    eventInteractionCreate(client);
};
