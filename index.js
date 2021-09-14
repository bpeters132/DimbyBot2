const fs = require("fs");
const Discord = require("discord.js");
require("dotenv").config();
const NLPCloudClient = require("nlpcloud");

const prefix = process.env.PREFIX;

const AIClient = new NLPCloudClient(
    "gpt-j",
    process.env.NLPCLOUDTOKEN,
    (gpu = true)
);

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
const client = new Discord.Client({
    intents: [
        Discord.Intents.FLAGS.GUILDS,
        Discord.Intents.FLAGS.GUILD_MESSAGES,
    ],
});

client.commands = new Discord.Collection();
client.cooldowns = new Discord.Collection();
const commandFolders = fs.readdirSync("./commands");

for (const folder of commandFolders) {
    const commandFiles = fs
        .readdirSync(`./commands/${folder}`)
        .filter((file) => file.endsWith(".js"));
    for (const file of commandFiles) {
        const command = require(`./commands/${folder}/${file}`);
        client.commands.set(command.name, command);
    }
}

// When Ready
client.once("ready", () => {
    console.log(`Logged in as ${client.user.tag}! (${client.user.id})`);
    client.user.setActivity(`${prefix}help | Serving the People`);
});

// On a message event
client.on("messageCreate", async (message) => {
    // if (message.channel.id === "880440145784999936") {
    if (
        message.channel.id === "669188919547396127" ||
        message.channel.id === "880179167965093929"
    ) {
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
        message.channel.sendTyping();
        // Build payload to send to api
        constant_context = context.constant_context;
        dynamic_context = context.messages;
        constant_context.unshift("Constant Context: \n");
        dynamic_context.unshift("\nDynamic Context: \n");
        payload = context.constant_context.concat(context.messages);
        payload.push("\nGenerated Single Line Response: ");
        payload = payload.join(" ");

        // Send payload to api
        response = await GenerateReponse(AIClient, payload);
        reply = response.data.generated_text;
        // console.log(payload);
        message.channel.send(reply);
    }

    // no u
    if (message.author.bot) return;
    content = await message.content.toLowerCase();
    if (content == "no u") {
        message.channel.send("no u");
    }

    if (!message.content.startsWith(prefix) || message.author.bot) return;

    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();

    // Verify a command exists
    if (!client.commands.has(commandName)) {
        message.reply("Command does not exist!");
        return;
    }

    // Alias Handling
    const command =
        client.commands.get(commandName) ||
        client.commands.find(
            (cmd) => cmd.aliases && cmd.aliases.includes(commandName)
        );

    // Verify a alias referenced command exists
    if (!command) return;

    // Guild only handling
    if (command.guildOnly && message.channel.type === "dm") {
        return message.reply("I can't execute that command inside DMs!");
    }

    // Permission handling
    if (command.permissions) {
        const authorPerms = message.channel.permissionsFor(message.author);
        if (!authorPerms || !authorPerms.has(command.permissions)) {
            return message.reply("You can not do this!");
        }
    }

    // Verify argument requirements
    if (command.args && !args.length) {
        let reply = `You didn't provide any arguments, ${message.author}!`;

        // If expected usage is defined in command
        if (command.usage) {
            reply += `\nThe proper usage would be: \`${prefix}${command.name} ${command.usage}\``;
        }

        return message.channel.send(reply);
    }

    // Cooldown handling
    const { cooldowns } = client;

    if (!cooldowns.has(command.name)) {
        cooldowns.set(command.name, new Discord.Collection());
    }

    const now = Date.now();
    const timestamps = cooldowns.get(command.name);
    const cooldownAmount = (command.cooldown || 3) * 1000;

    if (timestamps.has(message.author.id)) {
        const expirationTime =
            timestamps.get(message.author.id) + cooldownAmount;

        if (now < expirationTime) {
            const timeLeft = (expirationTime - now) / 1000;
            return message.reply(
                `please wait ${timeLeft.toFixed(
                    1
                )} more second(s) before reusing the \`${
                    command.name
                }\` command.`
            );
        }
    }
    timestamps.set(message.author.id, now);
    setTimeout(() => timestamps.delete(message.author.id), cooldownAmount); // Timeout to expire cooldown

    // Command Execution
    try {
        command.execute(message, args);
    } catch (error) {
        console.error(error);
        message.reply(
            `An error was encountered, please contact <@${process.env.OWNER_ID}>`
        );
    }
});

client.on("error", console.error);

client.login(process.env.TOKEN).catch((err) => console.log(err));
