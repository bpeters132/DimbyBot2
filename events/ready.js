const pingDat = require('../lib/pingDat.js');

module.exports = async (client) => {
    console.log(`Logged in as ${client.user.tag}! (${client.user.id})`);
    pingDat.ping(process.env.PING_LOGIN_URL);
    client.user.setActivity(`${process.env.PREFIX}help | Serving the People`);
    setInterval((client) => {
        client.user.setActivity(`${process.env.PREFIX}help | Serving the People`);
    }, 21600*1000);
    
    setInterval(() => {
        console.log('Doing a thing');
    });
       
};