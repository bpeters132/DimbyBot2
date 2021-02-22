const { MessageEmbed } = require("discord.js");
const { Command } = require("discord.js-commando");
const {
    createUser,
    readDataFile,
    updateDataFile,
} = require("../../scripts/datafile");

module.exports = class FiftyFifty extends (
    Command
) {
    constructor(client) {
        super(client, {
            name: "fiftyfifty",
            group: "fun",
            aliases:['5050', 'ff'],
            memberName: "fiftyfifty",
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
        var jsondata = await readDataFile();
        var authorID = message.author.id;

        function mesembed(mes, data, bet, win) {
            if (win == false){
                const embed = new MessageEmbed()
                .setColor("#DD1717")
                .setTitle(mes.author.username)
                .setThumbnail(mes.author.avatarURL())
                .addFields(
                    { name: "You lost!", value: "-$" + bet},
                    { name: "New Balance", value: "$" + data },
                )
                .setTimestamp();
                return mes.channel.send(embed);
            } else {
                const embed = new MessageEmbed()
                .setColor("#11B146")
                .setTitle(mes.author.username)
                .setThumbnail(mes.author.avatarURL())
                .addFields(
                    { name: "You win!", value: "+$" + bet},
                    { name: "New Balance", value: "$" + data },
                )
                .setTimestamp();
                return mes.channel.send(embed);
            }
            
            
        }

        function fiftyFifty(authorBalance) {
            if (authorBalance >= bet) {
                if (Math.random() < 0.5) {
                    authorBalance += bet;
                    mesembed(message, authorBalance, bet, true)

                } else {
                    authorBalance -= bet;
                    mesembed(message, authorBalance, bet, false)
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

        await updateDataFile(jsondata);
    }
};
