const { Command } = require("discord.js-commando");
const { createUser, readUserData } = require("../../scripts/datafile");
const { MessageEmbed } = require("discord.js");

module.exports = class Balance extends Command {
  constructor(client) {
    super(client, {
      name: "balance",
      aliases: ["bal", "dollars"],
      group: "stocks",
      memberName: "balance",
      description: "Check your money balance",
    });
  }

  async run(message) {
    var authorID = message.author.id;
    var authorBalance = await readUserData(authorID);

    function mesembed(mes, data) {
      const embed = new MessageEmbed()
        .setColor("#c7ffed")
        .setTitle(mes.author.username)
        .setThumbnail(mes.author.avatarURL())
        .addFields(
          { name: "Current Balance", value: "$" + data.balance },
          {
            name: "Stocks",
            value: JSON.stringify(data.stocks, 2, null),
          }
        )
        .setTimestamp();
      return mes.channel.send(embed);
    }

    switch (authorBalance) {
      case null:
        await createUser(authorID);
        var authorBalance = await readUserData(authorID);
        mesembed(message, authorBalance);
        break;
      default:
        mesembed(message, authorBalance);
    }
  }
};
