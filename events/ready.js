const pingDat = require('../lib/pingDat.js');

module.exports = async (client) => {
    console.log(`Logged in as ${client.user.tag}! (${client.user.id})`);
    client.user.setActivity(`${process.env.PREFIX}help | Serving the People`);
    pingDat.ping(process.env.PING_LOGIN_URL);
    setInterval((client) => {
        client.user.setActivity(`${process.env.PREFIX}help | Serving the People`);
    }, 21600*1000);
       
};