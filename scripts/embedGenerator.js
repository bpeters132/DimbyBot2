const { MessageEmbed } = require('discord.js');

module.exports.general = (title, description, arrFieldNames, arrFieldValues) => {
    return new Promise((resolve) => {
        if (typeof (arrFieldNames) != 'undefined') {
            if (arrFieldNames.length == arrFieldValues.length) {
                const response = new MessageEmbed()
                    .setTitle(title)
                    .setDescription(description);
                for (let i = 0; i < arrFieldNames.length; i++) {
                    response.addField(arrFieldNames[i], arrFieldValues[i]);
                }
                resolve(response);
            }
        } else {
            const response = new MessageEmbed()
                .setTitle(title)
                .setDescription(description);
            resolve(response);
        }
    });
};