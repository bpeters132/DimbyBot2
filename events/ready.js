module.exports = (client, ready) => {
    client.user.setPresence({ game: {name: '.help for help!'}, status: 'available'})
    console.log(`Logged in as ${client.user.tag}!`);
}