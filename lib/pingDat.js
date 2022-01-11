const request = require('request');

module.exports.ping = (url) => {
    var options = {
        method: 'GET',
        url: url,
    };
    request(options, function (error, response) {
        if (error) throw new Error(error);
        console.log(response.body);
    });
};