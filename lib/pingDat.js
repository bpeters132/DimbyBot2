const unirest = require('unirest');

module.exports.ping = (url) => {

    unirest.get(url).end((res) => {
        console.log(res);
    });

};