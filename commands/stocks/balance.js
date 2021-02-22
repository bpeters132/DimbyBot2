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
        var jsondata = await readDataFile();
        var authorID = message.author.id;

        function mesembed(mes, data) {
            const embed = new MessageEmbed()
                .setColor("#c7ffed")
                .setTitle(mes.author.username)
                .setThumbnail(mes.author.avatarURL())
                .addFields(
                    { name: "Current Balance", value: "$" + data[authorID].balance },
                    { name: "Stocks", value: JSON.stringify(data[authorID].stocks, 2, null) }
                )
                .setTimestamp();
            return mes.channel.send(embed);
        }

        if (jsondata[authorID]) { // if userdata exists, send the message
            mesembed(message, jsondata)
        } else {
            await createUser(authorID); // if no userdata, create userdata first then send message
            var jsondata = await readDataFile();
            mesembed(message, jsondata)
        }
    }
};
