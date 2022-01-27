const request = require('request');

const ping = (url) => {
    // If url isn't defined, stop processing
    if (typeof (url) == 'undefined') return;

    const options = {
        method: 'GET',
        url: url,
    };
    request(options, (err) => {
        if (err) {
            console.error(err);
        } else {
            console.log('Pinged PingDat!');
        }
    });
};

module.exports.ping = ping;