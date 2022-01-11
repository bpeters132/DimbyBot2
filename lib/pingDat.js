const unirest = require('unirest');

module.exports.ping = (url) => {
    unirest('GET', url)
        .headers({})
        .end((res) => {
            if (res.error) console.error(res.error);
            console.log(res);
        });
};