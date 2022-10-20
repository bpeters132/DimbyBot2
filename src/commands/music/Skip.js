import { SlashCommandBuilder } from 'discord.js';
import { QueueRepeatMode } from 'discord-player';
import secCheckChannel from '../../lib/secCheckChannel.js';

class Skip extends SlashCommandBuilder {
    constructor() {
        super();
        super.setName('skip');
        super.setDescription('Skip to the next song');
    }
    async run(client, message) {
        const queue = client.player.getQueue(message.guild.id);
        // if user asking command isn't in working channel, fail command
        const memberInChannel = await secCheckChannel(client, message, message.guild.id);
        if (!memberInChannel) return;
        if (!queue) return void message.reply({ content: '❌ | No music is being played!' });
        const currentTrack = queue.current;
        const currentRepeatMode = queue.repeatMode;
        if (currentRepeatMode == 1) {
            queue.setRepeatMode(QueueRepeatMode.OFF);
            const success = queue.skip();
            return void message.reply({
                content: success ? `✅ | Skipped **${currentTrack}! Track Looping Off!**` : '❌ | Something went wrong!'
            });
        } else {
            const success = queue.skip();
            return void message.reply({
                content: success ? `✅ | Skipped **${currentTrack}**!` : '❌ | Something went wrong!'
            });
        };

    }

}

const command = new Skip();
export default command;