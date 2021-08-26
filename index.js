const { CommandoClient } = require("discord.js-commando");
const { prefix, token, owner_id, nlpCloudToken } = require("./config.json");
const path = require("path");
const fs = require("fs");
const io = require("@pm2/io");
const NLPCloudClient = require("nlpcloud");

const client = new CommandoClient({
  commandPrefix: prefix,
  owner: owner_id,
  unknownCommandResponse: false,
});

const AIClient = new NLPCloudClient("gpt-j", nlpCloudToken, (gpu = true));

function GenerateReponse(client, context) {
  return new Promise((resolve) => {
    response = client.generation(
      context,
      (minLength = 1),
      (maxLength = 32),
      (lengthNoInput = true),
      (endSequence = "."),
      (removeInput = true),
      (topK = 0),
      (topP = 1.0),
      (temperature = 1.0),
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
  // Testing Condition, flip comments between two lines below to flip from testing/not testing.
  if (message.channel.id === "880440145784999936") {
    // if (message.channel.id === "669188919547396127" || message.channel.id === "880179167965093929") {

    // Add context for bot's past responses
    if (message.author.bot) {
      rawdata = fs.readFileSync("./data/gptContext.json");
      context = JSON.parse(rawdata);
      context.messages.push(message.content + ".");

      // Limit context list
      if (context.messages.length > 20) {
        context.messages.shift();
      }

      // Push context to file
      data = JSON.stringify(context, null, 2);
      fs.writeFileSync("./data/gptContext.json", data);
      return;
    }

    // Add new user context
    rawdata = fs.readFileSync("./data/gptContext.json");
    context = JSON.parse(rawdata);
    context.messages.push(message.content + ".");

    // Limit context list
    if (context.messages.length > 20) {
      context.messages.shift();
    }
    // Pust context to file
    data = JSON.stringify(context, null, 2);
    fs.writeFileSync("./data/gptContext.json", data);

    // Generate Response
    message.channel.startTyping();
    // Build payload to send to api
    constant_context = context.constant_context;
    dynamic_context = context.messages;
    constant_context.unshift("Constant Context: \n");
    dynamic_context.unshift("\nDynamic Context: \n");
    payload = context.constant_context.concat(context.messages);
    payload.push("\nGenerated Single Line Response: ")
    payload = payload.join(" ");

    // Send payload to api
    response = await GenerateReponse(AIClient, payload);
    reply = response.data.generated_text;
    message.channel.stopTyping();
    console.log(payload);
    message.channel.send(reply);
  }
  if (message.author.bot) return;

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
