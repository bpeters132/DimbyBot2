const { CommandoClient } = require("discord.js-commando");
const { prefix, token, owner_id, nlpCloudToken } = require("./config.json");
const path = require("path");
const unirest = require("unirest");
const io = require("@pm2/io");
const NLPCloudClient = require("nlpcloud");

const client = new CommandoClient({
  commandPrefix: prefix,
  owner: owner_id,
  unknownCommandResponse: false,
});

const AIClient = new NLPCloudClient("gpt-j", nlpCloudToken, (gpu = true));

function GenerateReponse(client, message) {
  return new Promise((resolve) => {
    response = client.generation(
      message.content,
      (minLength = 10),
      (maxLength = 128),
      (lengthNoInput = true),
      (endSequence = "."),
      (removeInput = true),
      (topK = 0),
      (topP = 0.9),
      (temperature = 0.8),
      (repetitionPenalty = 1.5),
      (lengthPenalty = 0.2)
    );
    resolve(response);
  });
}

client.registry
  .registerDefaultTypes()
  .registerGroups([
    ["fun", "Commands For Fun"],
    ["moderation", "Moderation Commands"],
    ["stocks", "Commands to buy/sell stocks with dimby dollars"],
    ["help", "Help Commands"],
  ])
  .registerDefaultGroups()
  .registerDefaultCommands()
  .registerCommandsIn(path.join(__dirname, "commands"));

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}! (${client.user.id})`);
  client.user.setActivity(
    `${prefix}help | Running on ${client.guilds.cache.size} servers`
  );
});

client.on("message", async (message) => {
  if (message.author.bot) return;

  if (message.channel.id === "669188919547396127") {
    message.channel.startTyping();
    response = await GenerateReponse(AIClient, message);
    reply = response.data.generated_text;
    message.channel.stopTyping();
    message.reply(reply);
  }

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
