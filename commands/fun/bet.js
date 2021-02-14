const { Command } = require("discord.js-commando");
const fs = require("fs");
const path = require("path");

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
        },
      ],
    });
  }

  async run(message, { bet }) {
    const rawdata = fs.readFileSync(
      path.join(__dirname, "../../", "data", "balances.json")
    );
    const jsondata = JSON.parse(rawdata);
    const authorID = message.author.id;

    if (jsondata[authorID]) {
      if (jsondata[authorID].balance >= bet) {
        if (Math.random() < 0.5) {
          jsondata[authorID].balance += bet;
          message.reply(
            "You won the bet! Your new balance is " +
              jsondata[authorID].balance +
              " dimby dollars."
          );
        } else {
          jsondata[authorID].balance -= bet;
          message.reply(
            "You lost the bet! Your new balance is " +
              jsondata[authorID].balance +
              " dimby dollars."
          );
        }
      } else {
        message.reply(
          "You can only bet the amount of your balance or less. You currently have " +
            jsondata[authorID].balance +
            " dimby dollars"
        );
      }
    } else {
      jsondata[authorID] = {
        balance: 50,
        daily: 0,
      };

      if (jsondata[authorID].balance <= bet) {
        if (Math.random() < 0.5) {
          jsondata[authorID].balance += bet;
          message.reply(
            "You won the bet! Your new balance is " +
              jsondata[authorID].balance +
              " dimby dollars."
          );
        } else {
          jsondata[authorID].balance -= bet;
          message.reply(
            "You lost the bet! Your new balance is " +
              jsondata[authorID].balance +
              " dimby dollars."
          );
        }
      } else {
        message.reply(
          "You can only bet the amount of your balance or less. You currently have " +
            jsondata[authorID].balance +
            " dimby dollars"
        );
      }
    }
    const updatedjson = JSON.stringify(jsondata, null, 2);
    fs.writeFileSync(
      path.join(__dirname, "../../", "data", "balances.json"),
      updatedjson
    );
  }
};
