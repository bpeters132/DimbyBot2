const { CommandoClient } = require("discord.js-commando");
const { prefix, token, owner_id } = require("./config.json");
const path = require("path");
const unirest = require("unirest");
const io = require("@pm2/io");
const fs = require("fs");

const client = new CommandoClient({
    commandPrefix: prefix,
    owner: owner_id,
    unknownCommandResponse: false,
});

client.registry
    .registerDefaultTypes()
    .registerGroups([
        ["fun", "Commands For Fun"],
        ["moderation", "Moderation Commands"],
        ["stocks", "Commands to buy/sell stocks with dimby dollars"],
    ])
    .registerDefaultGroups()
    .registerDefaultCommands()
    .registerCommandsIn(path.join(__dirname, "commands"));

fs.access(path.join("data"), function (err) {
    if (err) {
        console.log("Data directory does not exist");
        console.log("Creating Direcoty");
        fs.mkdirSync(path.join("data"));
    } else {
        console.log("Data directory exists");
    }
});

fs.access(path.join("data", "balances.json"), function (err) {
    if (err) {
        console.log("Balances files does not exist");
        console.log("Creating file");
        fs.writeFileSync(path.join("data", "balances.json"), "{}");
    } else {
        console.log("Balances file exists");
    }
});

fs.access(path.join("data", "stocks.json"), function (err) {
  if (err) {
      console.log("Stocks files does not exist");
      console.log("Creating file");
      fs.writeFileSync(path.join("data", "stocks.json"), "{}");
  } else {
      console.log("Stocks file exists");
  }
});

client.once("ready", () => {
    console.log(`Logged in as ${client.user.tag}! (${client.user.id})`);
    client.user.setActivity(
        `${prefix}help | Running on ${client.guilds.cache.size} servers`
    );
});

client.on("message", (message) => {
    if (message.author.bot) return;

    const request = unirest(
        "GET",
        `https://pingdat.io/?t=dmbybtmsgsnd4574&v=1`
    );
    request.end(function (response) {
        if (response.error) {
            message.reply(
                "An error has occurred, please contact the bot owner."
            );
            return console.error("GET error: ", response.error);
        }
        console.log("Pinged Pingdat!");
    });

    if (message.content.toLowerCase() === "no u") {
        message.channel.send("no u");
    }

    if (message.content.toLowerCase() === "u no") {
        message.channel.send({ files: ["https://i.imgflip.com/2rytcz.jpg"] });
    }
});

io.init({
    transactions: true, // will enable the transaction tracing
    http: true, // will enable metrics about the http server (optional)
});

client.on("error", console.error);

client.login(token);
