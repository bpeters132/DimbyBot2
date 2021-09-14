const prefix = process.env.PREFIX;

module.exports = {
    name: "help",
    description: "List all of my commands or info about a specific command.",
    cooldown: 5,
    aliases: ["commands"],
    usage: "[command name]",
    async execute(client, message, args) {
        const data = [];
        const { commands } = client;
        if (!args.length) {
            data.push("Here's a list of all my commands:");
            data.push(
                `\`\`\`${commands
                    .map((command) => command.name)
                    .join(", ")}\`\`\``
            );
            data.push(
                `You can send \`${prefix}help [command name]\` to get info on a specific command!\n`,
                "I can also play music! Type `/` and look for me in the command window!"
            );
            response = data.join("\n");
            return message.reply(response);
        }
        const name = args[0].toLowerCase();
        const command =
            commands.get(name) ||
            commands.find((c) => c.aliases && c.aliases.includes(name));

        if (!command) {
            return message.reply("That's not a valid command!");
        }

        data.push(`**Name:** ${command.name}`);

        if (command.aliases)
            data.push(`**Aliases:** ${command.aliases.join(", ")}`);
        if (command.description)
            data.push(`**Description:** ${command.description}`);
        if (command.usage)
            data.push(`**Usage:** ${prefix}${command.name} ${command.usage}`);

        data.push(`**Cooldown:** ${command.cooldown || 3} second(s)`);
        response = data.join("\n");
        message.reply(response);
    },
};
