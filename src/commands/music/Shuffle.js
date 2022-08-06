import { SlashCommandBuilder } from 'discord.js';
import customShuffle from '../../lib/customShuffle.js';

class Shuffle extends SlashCommandBuilder {
    constructor() {
        super();
        super.setName('shuffle');
        super.setDescription('Shuffles the current queue');
    }
    async run(client, message) {
        if (!message.member.voice.channel) {
            return message.reply('You have to be in a voice channel to do that!');
        }

        const queue = client.player.getQueue(message.guild.id);
        if (!queue) return void message.reply({ content: '❌ | No music is being played!' });

        // await queue.shuffle();
        customShuffle(queue);

        message.reply({ content: '✅ | Queue has been shuffled!' });

    }

}

const command = new Shuffle();
export default command;