const { Command } = require("discord.js-commando");
const { createUser, readDataFile } = require("../../scripts/datafile");

module.exports = class Balance extends (
    Command
) {
    constructor(client) {
        super(client, {
            name: "balance",
            group: "fun",
            memberName: "balance",
            description: "Check your money balance",
        });
    }

    async run(message) {
        var jsondata = readDataFile();
        var authorID = message.author.id;

        if (jsondata[authorID]) {
            message.reply(
                "You currently have " +
                    String(jsondata[authorID].balance) +
                    " dimby dollars in your account"
            );
        } else {
            createUser(authorID);
            var jsondata = readDataFile();
            message.reply(
                "You currently have " +
                    String(jsondata[authorID].balance) +
                    " dimby dollars in your account"
            );
        }
    }
};
