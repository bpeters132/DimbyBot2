import { SlashCommandBuilder } from 'discord.js';
import { QueueRepeatMode } from 'discord-player';

class LoopQueue extends SlashCommandBuilder {
    constructor() {
        super();
        super.setName('loopqueue');
        super.setDescription('Loop the queue');
    }
    async run(client, message) {
        if (!message.member.voice.channel) {
            return message.reply('You have to be in a voice channel to do that!');
        }

        const queue = client.player.getQueue(message.guild.id);
        if (!queue) return void message.reply({ content: '❌ | No music is being played!' });
        const currentMode = queue.repeatMode;

        if (currentMode == 1) {
            const success = queue.setRepeatMode(QueueRepeatMode.OFF);
            return void message.reply({ content: success ? 'Queue is no longer looping!' : '❌ | Could not update loop mode!' });
        } else {
            const success = queue.setRepeatMode(QueueRepeatMode.QUEUE);
            return void message.reply({ content: success ? 'Queue is looping!' : '❌ | Could not update loop mode!' });
        }


    }

}

const command = new LoopQueue();
export default command;