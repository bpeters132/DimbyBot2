import { SlashCommandBuilder } from 'discord.js';

class Queue extends SlashCommandBuilder {
    constructor() {
        super();
        super.setName('queue');
        super.setDescription('Get current queue');

    }
    async run(client, message) {
        if (!message.member.voice.channel) {
            return message.reply('You have to be in a voice channel to do that!');
        }

        const queue = client.player.getQueue(message.guild.id);
        if (!queue) return void message.reply({ content: '❌ | No music is being played!' });
        const currentTrack = queue.current;
        const tracks = queue.tracks.slice(0, 10).map((m, i) => {
            return `${i + 1}. **${m.title}** ([link](${m.url}))`;
        });

        return void message.reply({
            embeds: [
                {
                    title: 'Server Queue',
                    description: `${tracks.join('\n')}${queue.tracks.length > tracks.length
                        // eslint-disable-next-line indent
                        ? `\n...${queue.tracks.length - tracks.length === 1 ? `${queue.tracks.length - tracks.length} more track` : `${queue.tracks.length - tracks.length} more tracks`}`
                        // eslint-disable-next-line indent
                        : ''
                        // eslint-disable-next-line indent
                        }`,
                    color: 0xff0000,
                    fields: [{ name: 'Now Playing', value: `🎶 | **${currentTrack.title}** ([link](${currentTrack.url}))` }]
                }
            ]
        });


    }

}

const command = new Queue();
export default command;