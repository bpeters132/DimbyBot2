const prefix = process.env.PREFIX;
const fs = require('fs');
const egenerator = require('../../lib/embedGenerator');

module.exports =  {
    name: 'help',
    description: 'List all of my commands or info about a specific command.',
    cooldown: 5,
    aliases: ['commands'],
    usage: '[command name]',
    async execute(client, message, args) {
        const { commands } = client;
        if (!args.length) {
            // Build Variables for response
            const resTitle = 'Here\'s a list of all my commands:';
            const resDesc = `You can send \`${prefix}help [command name]\` to get info on a specific command!`;
            const arrFieldNames = [];
            const arrFieldValues = [];
            const arrFields = [];

            const commandFolders = fs.readdirSync('./commands');
            commandFolders.forEach(element => {
                let commandFiles = fs.readdirSync(`./commands/${element}`);
                let commandNames = [];
                commandFiles.forEach(element => {
                    commandNames.push(element.substring(0, element.length-3));
                });

                let currentField = {
                    FieldName:(element.charAt(0).toUpperCase() + element.slice(1)),
                    Commands: commandNames
                };
                arrFields.push(currentField);
            });
                
            arrFields.forEach(element => {
                arrFieldNames.push(element.FieldName);
                arrFieldValues.push((element.Commands).join(', '));
            });

            // Generate Embeded response with built variables
            const response = await egenerator.general(resTitle, resDesc, arrFieldNames, arrFieldValues);
            // Send Response
            return message.channel.send({ embeds: [response] });
        }

        // Continue and build help if specific command is specified
        const name = args[0].toLowerCase();
        const command =
            commands.get(name) ||
            commands.find((c) => c.aliases && c.aliases.includes(name));

        if (!command) {
            return message.reply('That\'s not a valid command!');
        }

        // Build Variables for response
        const resTitle = command.name.charAt(0).toUpperCase() + command.name.slice(1);
        const resDesc = command.description;
        const arrFieldNames = [];
        const arrFieldValues = [];

        if (command.aliases) {
            arrFieldNames.push('Aliases');
            arrFieldValues.push(command.aliases.join(', '));
        }
        if (command.usage) {
            arrFieldNames.push('Usage');
            arrFieldValues.push(`${prefix}${command.name} ${command.usage}`);
        }

        arrFieldNames.push('Cooldown');
        arrFieldValues.push(`${command.cooldown || 3} second(s)`);

        // Generate Embeded response with built variables
        const response = await egenerator.general(resTitle, resDesc, arrFieldNames, arrFieldValues);

        // Send Response
        message.channel.send({ embeds: [response] });
    },
};
