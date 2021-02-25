const { Command } = require("discord.js-commando");
const {
  createUser,
  readUserData,
  updateUserData,
} = require("../../scripts/datafile");

module.exports = class Daily extends Command {
  constructor(client) {
    super(client, {
      name: "daily",
      group: "fun",
      memberName: "daily",
      description: "Claim your daily dimby dollars",
    });
  }

  async run(message) {
    var authorID = message.author.id;
    var userData = await readUserData(authorID);

    switch (userData) {
      case null:
        await createUser(authorID);
        var userData = await readUserData(authorID);
        console.log(userData)
        userData.daily = Date.now();

        await updateUserData(authorID, userData);

        message.reply(
          "You now have " + userData.balance + " dimby dollars in your account"
        );
        break;
      default:
        if (userData.daily < Date.now() - 86400 * 1000) {
          userData.balance += 2000;
          userData.daily = Date.now();

          await updateUserData(authorID, userData);

          message.reply(
            "You now have " +
              userData.balance +
              " dimby dollars in your account"
          );
        } else {
          message.reply("You can only use the daily command once a day!");
        }
    }

    // if (userData) {
    //   if (userData.daily < Date.now() - 86400 * 1000) {
    //     userData.balance += 2000;
    //     userData.daily = Date.now();

    //     updateUserData(userData);

    //     message.reply(
    //       "You now have " + userData.balance + " dimby dollars in your account"
    //     );
    //   } else {
    //     message.reply("You can only use the daily command once a day!");
    //   }
    // } else {
    //   await createUser(authorID);
    //   var userData = await readUserData();
    //   userData.daily = Date.now();

    //   updateUserData(userData);

    //   message.reply(
    //     "You now have " + userData.balance + " dimby dollars in your account"
    //   );
    // }
  }
};
