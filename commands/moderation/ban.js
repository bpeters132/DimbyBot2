const { Command } = require("discord.js-commando");

module.exports = class BanCommand extends (
    Command
) {
    constructor(client) {
        super(client, {
            name: "ban",
            group: "moderation",
            memberName: "ban",
            guildOnly: true,
            description: "Bans a specified user",
            clientPermissions: ["BAN_MEMBERS"],
            userPermissions: ["BAN_MEMBERS"],
            args: [
                {
                    key: "ban_user",
                    prompt: "Please specify a user to ban",
                    type: "member",
                },
                {
                    key: "ban_reason",
                    prompt: "Please specify a reason for the ban",
                    type: "string",
                },
            ],
        });
    }

    async run(message, { ban_user, ban_reason }) {
        ban_user.ban(ban_reason);
        message.reply(
            `User ${ban_user} has been banned for reason: ${ban_reason}`
        );
    }
};
