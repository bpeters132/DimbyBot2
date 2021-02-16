const { Command } = require("discord.js-commando");
const {
    createUser,
    readDataFile,
    updateDataFile,
} = require("../../scripts/datafile");

module.exports = class Bet extends (
    Command
) {
    constructor(client) {
        super(client, {
            name: "bet",
            group: "fun",
            memberName: "bet",
            description: "Bet your money away!",
            args: [
                {
                    key: "bet",
                    prompt: "Please enter a bet",
                    type: "integer",
                    validate: (bet) => bet > 0,
                },
            ],
        });
    }

    async run(message, { bet }) {
        var jsondata = readDataFile();
        var authorID = message.author.id;

        function fiftyFifty(authorBalance) {
            if (authorBalance >= bet) {
                if (Math.random() < 0.5) {
                    authorBalance += bet;
                    message.reply(
                        "You won the bet! Your new balance is " +
                            authorBalance +
                            " dimby dollars."
                    );
                } else {
                    authorBalance -= bet;
                    message.reply(
                        "You lost the bet! Your new balance is " +
                            authorBalance +
                            " dimby dollars."
                    );
                }
            } else {
                message.reply(
                    "You can only bet the amount of your balance or less. You currently have " +
                        authorBalance +
                        " dimby dollars"
                );
            }
            return authorBalance;
        }

        if (jsondata[authorID]) {
            jsondata[authorID].balance = fiftyFifty(jsondata[authorID].balance);
        } else {
            createUser(authorID);
            var jsondata = readDataFile();
            jsondata[authorID].balance = fiftyFifty(jsondata[authorID].balance);
        }

        updateDataFile(jsondata);
    }
};
