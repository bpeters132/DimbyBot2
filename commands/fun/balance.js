const { Command } = require("discord.js-commando");
const fs = require("fs");
const path = require("path");

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
    const rawdata = fs.readFileSync(
      path.join(__dirname, "../../", "data", "balances.json")
    );
    const jsondata = JSON.parse(rawdata);
    const authorID = message.author.id;

    if (jsondata[authorID]) {
      message.reply(
        "You currently have " +
          String(jsondata[authorID].balance) +
          " dimby dollars in your account"
      );
    } else {
      jsondata[authorID] = {
        "balance":50,
        "daily":0
      }
      const updatedjson = JSON.stringify(jsondata, null, 2);
      fs.writeFileSync(
        path.join(__dirname, "../../", "data", "balances.json"),
        updatedjson
      );
      message.reply(
        "You currently have " +
          String(jsondata[authorID].balance) +
          " dimby dollars in your account"
      );
    }
  }
};
