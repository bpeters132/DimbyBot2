import ping from '../commands/ping.js';

export const interactions = [
    ping
];

export const commands = [
    ping
].map(command => command.toJSON());
