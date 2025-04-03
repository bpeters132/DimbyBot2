import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';


export default{
    data: new SlashCommandBuilder()
        .setName('clear')
        .setDescription('Used to clear messages, can clear up to 30 messages')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addIntegerOption(option =>
            option.setName('count').setDescription('The amount of messages to clear').setRequired(true)),

    /**
     * 
     * @param {import('discord.js').Client} client 
     * @param {import('discord.js').CommandInteraction} interaction 
     * 
     */
    async run(client, interaction) {
        const clear_amount = interaction.options.getInteger('count');
        const channel = interaction.channel;

        if (clear_amount <= 30) {
            try {
                await channel.bulkDelete(clear_amount + 1);
                interaction.reply(`Cleared ${clear_amount} messages!`);

            } catch (error) {
                client.logger.log(error);
                interaction.reply('An error occured, verify you\'re only clearning messages that are under 14 days old!');
            }
        } else {
            interaction.reply('You can only clear up to 30 messages at once!');
        }
    }
};