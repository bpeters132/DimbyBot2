import { SlashCommandBuilder } from 'discord.js';

class NowPlaying extends SlashCommandBuilder {
    constructor() {
        super();
        super.setName('nowplaying');
        super.setDescription('Tells you what\'s currently playing');
    }
    async run(client, message) {
        if (!message.member.voice.channel) {
            return message.reply('You have to be in a voice channel to do that!');
        }

        const queue = client.player.getQueue(message.guild.id);
        if (!queue || !queue.playing) return void message.reply({ content: '❌ | No music is being played!' });
        const progress = queue.createProgressBar();
        const perc = queue.getPlayerTimestamp();
        const source = queue.current.source;

        return void message.reply({
            embeds: [
                {
                    title: 'Now Playing',
                    description: `🎶 | **${queue.current.title}**! (\`${perc.progress}%\`)`,
                    fields: [
                        {
                            name: '\u200b',
                            value: progress
                        }, {
                            name: 'Source',
                            value: source
                        }
                    ],
                    color: 0xffffff
                }
            ]
        });

    }

}

const command = new NowPlaying();
export default command;