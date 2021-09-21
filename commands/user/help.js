const prefix = process.env.PREFIX;
const { MessageEmbed } = require('discord.js');
module.exports = {
    name: 'help',
    description: 'List all of my commands or info about a specific command.',
    cooldown: 5,
    aliases: ['commands'],
    usage: '[command name]',
    async execute(client, message, args) {

        const { commands } = client;
        if (!args.length) {
            const response = new MessageEmbed()
                .setTitle('Here\'s a list of all my commands:')
                .setDescription(
                    `You can send \`${prefix}help [command name]\` to get info on a specific command!\n`,

                )
                .addFields(
                    {
                        name: 'Commands', value: `${commands
                            .map((command) => command.name)
                            .join(', ')}`
                    },
                    {
                        name: 'Music', value: 'I can also play music! Type `/` and look for me in the command window!'
                    }
                );
            return message.channel.send({ embeds: [response] });
        }
        const name = args[0].toLowerCase();
        const command =
            commands.get(name) ||
            commands.find((c) => c.aliases && c.aliases.includes(name));

        if (!command) {
            return message.reply('That\'s not a valid command!');
        }

        const response = new MessageEmbed().setTitle(command.name.charAt(0).toUpperCase() + command.name.slice(1));
        if (command.aliases) {
            response.addField('Aliases', command.aliases.join(', '));
        }
        if (command.description) {
            response.addField('Description', command.description);
        }
        if (command.usage) {
            response.addField('Usage', `${prefix}${command.name} ${command.usage}`);
        }
        response.addField('Cooldown', `${command.cooldown || 3} second(s)`);

        message.channel.send({ embeds: [response] });
    },
};
