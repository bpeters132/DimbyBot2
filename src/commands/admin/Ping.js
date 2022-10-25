import { SlashCommandBuilder } from 'discord.js';
class Ping extends SlashCommandBuilder {
    constructor() {
        super();
        super.setName('ping');
        super.setDescription('Replies with pong!');
    }
    async run(interaction) {
        console.log('Pong!');
        await interaction.reply('Pong!');
    };
}
const command = new Ping();
export default command;