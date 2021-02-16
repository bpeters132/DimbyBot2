const { Command } = require("discord.js-commando");
const {
    createUser,
    readDataFile,
    updateDataFile,
} = require("../../scripts/datafile");

module.exports = class Daily extends (
    Command
) {
    constructor(client) {
        super(client, {
            name: "daily",
            group: "fun",
            memberName: "daily",
            description: "Claim your daily dimby dollars",
        });
    }

    async run(message) {
        var jsondata = readDataFile();
        var authorID = message.author.id;

        if (jsondata[authorID]) {
            if (jsondata[authorID].daily < Date.now() - 86400) {
                jsondata[authorID].balance += 2000;
                jsondata[authorID].daily = Date.now();

                updateDataFile(jsondata);

                message.reply(
                    "You now have " +
                        jsondata[authorID].balance +
                        " dimby dollars in your account"
                );
            } else {
                message.reply("You can only use the daily command once a day!");
            }
        } else {
            createUser(authorID);
            var jsondata = readDataFile();
            jsondata[authorID].daily = Date.now();

            updateDataFile(jsondata);

            message.reply(
                "You now have " +
                    jsondata[authorID].balance +
                    " dimby dollars in your account"
            );
        }
    }
};
