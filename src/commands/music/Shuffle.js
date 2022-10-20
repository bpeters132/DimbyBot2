import { SlashCommandBuilder } from 'discord.js';
import customShuffle from '../../lib/customShuffle.js';
import secCheckChannel from '../../lib/secCheckChannel.js';

class Shuffle extends SlashCommandBuilder {
    constructor() {
        super();
        super.setName('shuffle');
        super.setDescription('Shuffles the current queue');
    }
    async run(client, message) {
        const queue = client.player.getQueue(message.guild.id);
        // if user asking command isn't in working channel, fail command
        const memberInChannel = await secCheckChannel(client, message, message.guild.id);
        if (!memberInChannel) return;
        if (!queue) return void message.reply({ content: '❌ | No music is being played!' });

        // await queue.shuffle();
        customShuffle(queue);

        message.reply({ content: '✅ | Queue has been shuffled!' });

    }

}

const command = new Shuffle();
export default command;