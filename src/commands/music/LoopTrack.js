import { SlashCommandBuilder } from 'discord.js';
import { QueueRepeatMode } from 'discord-player';

class LoopTrack extends SlashCommandBuilder {
    constructor() {
        super();
        super.setName('looptrack');
        super.setDescription('Loop the track');
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
            return void message.reply({ content: success ? 'Track is no longer looping!' : '❌ | Could not update loop mode!' });
        } else {
            const success = queue.setRepeatMode(QueueRepeatMode.TRACK);
            return void message.reply({ content: success ? 'Track is looping!' : '❌ | Could not update loop mode!' });
        }


    }

}

const command = new LoopTrack();
export default command;