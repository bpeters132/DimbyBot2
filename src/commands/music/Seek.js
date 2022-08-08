import { SlashCommandBuilder } from 'discord.js';


class Seek extends SlashCommandBuilder {
    constructor() {
        super();
        super.setName('seek');
        super.setDescription('Seek to a part of the current playing song in seconds.');
        super.addIntegerOption(option =>
            option.setName('time').setDescription('time to seek in seconds').setRequired(true));
    }
    async run(client, interaction) {
        if (!interaction.member.voice.channel) {
            return interaction.reply('You have to be in a voice channel to do that!');
        }

        const queue = client.player.getQueue(interaction.guild.id);
        if (!queue) return void interaction.reply({ content: '❌ | No music is being played!' });

        const time = interaction.options.getInteger('time') * 1000;

        await queue.seek(time);

        interaction.reply(`✅ | Seeked to ${time / 1000} seconds`);


    }
}

const command = new Seek();
export default command;