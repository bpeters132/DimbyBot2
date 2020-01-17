const {Command} = require('discord.js-commando')

module.exports = class MeowCommand extends Command {
    constructor(client){
        super(client, {
            name: 'meow',
            aliases: ['kitty-cat'],
            group: 'fun',
            memberName: 'meow',
            description: 'Replies with a meow, kitty cat.',
            throttling: {
                usages: 2,
                duration: 10,
            },
            guildOnly: true,
            clientPermissions: ['ADMINISTRATOR'],
            userPermissions: ['MANAGE_MESSAGES'],
            ownerOnly: true,
        })
    }

    run(message) {
        return message.say('Meow!')
    }
}