const commando = require('discord.js-commando')

module.exports = class PlayCommand extends commando.Command {

    constructor(client) {
        super(client, {
            name: 'play',
            group: 'music',
            memberName: 'play',
            description: 'Plays a specified youtube url or search term',
            throttling: {
                usages: 1,
                duration: 2,
            },

        })
    }

    run(message) {
        return
    }
}