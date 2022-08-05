import { SlashCommandBuilder } from 'discord.js';
class ping extends SlashCommandBuilder {
    constructor() {
        const builder = super();
        builder.setName('ping');
        builder.setDescription('Replies with pong!');
    }
    async run(ctx) {
        console.log('Pong!');
        await ctx.reply('Pong!');
    };
}
const command = new ping();
export default command;
