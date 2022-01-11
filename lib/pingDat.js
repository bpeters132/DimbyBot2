const request = require('request');

module.exports.ping = (url) => {
    request.get(url).on('error', (err) =>{
        console.error(err);
    });
};