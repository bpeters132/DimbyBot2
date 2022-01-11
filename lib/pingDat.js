const curl = require('curl');

module.exports.ping = (url) => {
    curl.get(url);
};