import { SlashCommandBuilder } from 'discord.js';
import secCheckChannel from '../../lib/secCheckChannel.js';


class Seek extends SlashCommandBuilder {
    constructor() {
        super();
        super.setName('seek');
        super.setDescription('Seek to a part of the current playing song in seconds.');
        super.addIntegerOption(option =>
            option.setName('time').setDescription('time to seek in seconds').setRequired(true));
    }
    async run(client, message) {
        const queue = client.player.getQueue(message.guild.id);
        // if user asking command isn't in working channel, fail command
        const memberInChannel = await secCheckChannel(client, message, message.guild.id);
        if (!memberInChannel) return;
        if (!queue) return void message.reply({ content: '❌ | No music is being played!' });

        const time = message.options.getInteger('time') * 1000;

        await queue.seek(time);

        message.reply(`✅ | Seeked to ${time / 1000} seconds`);


    }
}

const command = new Seek();
export default command;