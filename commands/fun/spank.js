const {Command} = require('discord.js-commando')

module.exports = class SpankCommand extends Command {
    constructor(client) {
        super(client, {
            name: 'spank',
            group: 'fun',
            memberName: 'spank',
            description: 'Spanks specified user.',
            args: [
                {
                    key: 'spankie',
                    prompt: 'You need to specify someone I should spank!',
                    type: 'member',
                },
            ],
        })
    }

    run(message, { spankie }) {
        return message.say(`${spankie} has been spanked!`)
    }
}