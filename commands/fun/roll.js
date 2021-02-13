const { Command } = require('discord.js-commando')

module.exports = class Roll extends Command {
    constructor(client) {
        super(client, {
            name: 'roll',
            group: 'fun',
            memberName: 'roll',
            description: 'Roll a random number between 1 and specified maximum',
            args: [
                {
                    key: 'num',
                    prompt: 'Please enter a max number',
                    type: 'integer',
                },
            ],
        })
    }

    run(message, {num}){
        message.reply((Math.floor(Math.random() * Math.floor(num)))+1)
    }
}