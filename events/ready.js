module.exports = async (client) => {
    console.log(`Logged in as ${client.user.tag}! (${client.user.id})`);
    client.user.setActivity(`${process.env.PREFIX}help | Serving the People`);
    
};