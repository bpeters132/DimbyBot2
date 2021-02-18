const { Command } = require("discord.js-commando");
const { createUser, readDataFile } = require("../../scripts/datafile");
const { MessageEmbed } = require("discord.js");

module.exports = class Balance extends Command {
    constructor(client) {
        super(client, {
            name: "balance",
            aliases: ["bal", "dollars"],
            group: "fun",
            memberName: "balance",
            description: "Check your money balance",
        });
    }

    async run(message) {
        var jsondata = readDataFile();
        var authorID = message.author.id;

        if (jsondata[authorID]) {
            const embed = new MessageEmbed()
                .setColor("#c7ffed")
                .setTitle(message.author.username)
                .setThumbnail(message.author.avatarURL())
                .addFields(
                    { name: "Current Balance", value: "$" + jsondata[authorID].balance },
                    { name: "Stocks", value: JSON.stringify(jsondata[authorID].stocks, 2, null)}
                )
                .setTimestamp();
            message.channel.send(embed);
        } else {
            createUser(authorID);
            var jsondata = readDataFile();
            const embed = new MessageEmbed()
                .setColor("#c7ffed")
                .setTitle(message.author.username)
                .setThumbnail(message.author.avatar)
                .addFields(
                    { name: "Current Balance", value: "$" + jsondata[authorID].balance },
                    { name: "Stocks", value: JSON.stringify(jsondata[authorID].stocks, 2, null)}
                )
                .setTimestamp();
            message.channel.send(embed);
        }
    }
};
