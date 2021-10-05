const prefix = process.env.PREFIX;
const egenerator = require('../../lib/embedGenerator');
// import egenerator from '../../lib/embedGenerator';

module.exports = {
    name: 'help',
    description: 'List all of my commands or info about a specific command.',
    cooldown: 5,
    aliases: ['commands'],
    usage: '[command name]',
    async execute(client, message, args) {
        const { commands } = client;
        if (!args.length) {
            console.log('1');
            // Build Variables for response
            const resTitle = 'Here\'s a list of all my commands:';
            console.log('1');
            const resDesc = `You can send \`${prefix}help [command name]\` to get info on a specific command!`;
            console.log('1');
            const arrFieldNames = [
                'Commands',
                'Music'
            ];
            console.log('1');
            const arrFieldValues = [
                `${commands.map((command) => command.name).join(', ')}`,
                'I can also play music! Type `/` and look for me in the command window!'
            ];
            console.log('1');
            
            // Generate Embeded response with built variables
            const response = await egenerator.general(resTitle, resDesc, arrFieldNames, arrFieldValues);
            console.log('1');
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
