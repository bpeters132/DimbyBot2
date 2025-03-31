import { SlashCommandBuilder } from 'discord.js';
import customShuffle from '../../lib/customShuffle.js';
import secCheckChannel from '../../lib/secCheckChannel.js';

class Shuffle extends SlashCommandBuilder {
    constructor() {
        super();
        super.setName('shuffle');
        super.setDescription('Shuffles the current queue');
    }
    async run(client, interaction) {
        const queue = client.player.getQueue(interaction.guild.id);
        // if user asking command isn't in working channel, fail command
        const memberInChannel = await secCheckChannel(client, interaction, interaction.guild.id);
        if (!memberInChannel) return;
        if (!queue) return void interaction.reply({ content: '❌ | No music is being played!' });

        // await queue.shuffle();
        customShuffle(queue);

        interaction.reply({ content: '✅ | Queue has been shuffled!' });

    }

}

const command = new Shuffle();
export default command;