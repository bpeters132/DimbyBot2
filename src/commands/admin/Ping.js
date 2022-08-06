import { SlashCommandBuilder } from 'discord.js';
class Ping extends SlashCommandBuilder {
    constructor() {
        super();
        super.setName('ping');
        super.setDescription('Replies with pong!');
    }
    async run(ctx) {
        console.log('Pong!');
        await ctx.reply('Pong!');
    };
}
const command = new Ping();
export default command;