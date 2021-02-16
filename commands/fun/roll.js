const { Command } = require("discord.js-commando");

module.exports = class Roll extends (
    Command
) {
    constructor(client) {
        super(client, {
            name: "roll",
            group: "fun",
            memberName: "roll",
            description:
                "Roll a random number between 1 and specified maximum, not larger than 9223372036854775807 or smaller than 1",
            args: [
                {
                    key: "num",
                    prompt: "Please enter a max number",
                    type: "integer",
                    validate: (num) => num >= 1 && num <= 9223372036854775807,
                },
            ],
        });
    }

    async run(message, { num }) {
        message.reply(Math.floor(Math.random() * Math.floor(num)) + 1);
    }
};
