const { Command } = require('discord.js-commando')
const unirest = require('unirest')
const Discord = require('discord.js')


module.exports = class UrbanCommand extends Command {
    constructor(client) {
        super(client, {
            name: 'urban',
            group: 'fun',
            memberName: 'urban',
            description: 'Looks up the urban dictionary definition of a word or phrase.',
            args: [
                {
                    key: 'word',
                    prompt: 'You need to specify a word or phrase for me to look up',
                    type: 'string',
                },
            ],
        })
    }

    run(message, { word }) {
        const request = unirest("GET", "https://mashape-community-urban-dictionary.p.rapidapi.com/define");

        request.query({
            "term": word
        });

        request.headers({
            "x-rapidapi-host": "mashape-community-urban-dictionary.p.rapidapi.com",
            "x-rapidapi-key": "a204e3a3ebmshfa26fe8cd83c110p189835jsnf974dfc15017"
        });


        request.end(function (response) {
            if (response.error){
                message.reply('An error has occurred, please contact the bot owner.')
                return console.error('GET error: ', response.error)
            }

            try {
                var final_response = response.body['list'][0]['definition'].replace(/\[/g, '').replace(/\]/g, '')  
            } catch (error) {
                message.reply('There was no definition found for your term.. try again.')
            } 

            if (final_response.length > 1024 && final_response.length < 2000) {
                message.say(`${word.charAt(0).toUpperCase() + word.substring(1)}: ${final_response}`)

            } else if (final_response.length <= 1024) {
                const urban_response = new Discord.MessageEmbed()
                    .setColor('#0099ff')
                    .setTitle(word.charAt(0).toUpperCase() + word.substring(1))
                    .addField('Definition', final_response)

                message.say(urban_response)
            } else {
                message.reply('Definition too long for discord to handle!')
            }


        });
    }
}