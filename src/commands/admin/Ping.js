import { SlashCommandBuilder } from 'discord.js';
class Ping extends SlashCommandBuilder {
    constructor() {
        super();
        super.setName('ping');
        super.setDescription('Replies with pong!');
    }
    /**
     * 
     * @param {import('discord.js').Client} client 
     * @param {import('discord.js').CommandInteraction} interaction 
     * 
     */
    async run(client, interaction) {
        console.log('Pong!');
        // console.log(interaction);
        await interaction.reply('Pong!');
    };
}
const command = new Ping();
export default command;