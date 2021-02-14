const { Command } = require("discord.js-commando");
const fs = require("fs");
const path = require("path");

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
    const rawdata = fs.readFileSync(
      path.join(__dirname, "../../", "data", "balances.json")
    );
    const jsondata = JSON.parse(rawdata);
    const authorID = message.author.id;

    if (jsondata[authorID]) {
    
        if (jsondata[authorID].daily < ((Date.now()-86400))){
            jsondata[authorID].balance += 50
            jsondata[authorID].daily = Date.now()
            
            const updatedjson = JSON.stringify(jsondata, null, 2);
            fs.writeFileSync(
                path.join(__dirname, "../../", "data", "balances.json"),
                updatedjson
            );

            message.reply("You now have " + jsondata[authorID].balance + " dimby dollars in your account")
        } else {
            message.reply("You can only use the daily command once a day!")
        }

    } else {
      jsondata[authorID] = {
        balance: 100,
        daily: Date.now(),
      };
      const updatedjson = JSON.stringify(jsondata, null, 2);
      fs.writeFileSync(
        path.join(__dirname, "../../", "data", "balances.json"),
        updatedjson
      );

      message.reply("You now have " + jsondata[authorID].balance + " dimby dollars in your account")

    }
  }
};
