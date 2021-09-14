const Discord = require('discord.js')
module.exports = async (client, message) => {
    // no u
    if (message.author.bot || message.channel.type === "dm") return;
    content = await message.content.toLowerCase();
    if (content == "no u") {
        message.channel.send("no u");
    }

    if (!message.content.startsWith(process.env.PREFIX) || message.author.bot) return;

    const args = message.content.slice(process.env.PREFIX.length).trim().split(/ +/);
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
            reply += `\nThe proper usage would be: \`${process.env.PREFIX}${command.name} ${command.usage}\``;
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
                )} more second(s) before reusing the \`${command.name
                }\` command.`
            );
        }
    }
    timestamps.set(message.author.id, now);
    setTimeout(() => timestamps.delete(message.author.id), cooldownAmount); // Timeout to expire cooldown

    // Command Execution
    try {
        command.execute(client, message, args);
    } catch (error) {
        console.error(error);
        message.reply(
            `An error was encountered, please contact <@${process.env.OWNER_ID}>`
        );
    }
}