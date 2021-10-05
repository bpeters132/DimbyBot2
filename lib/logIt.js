const fs = require('fs');
const path = require('path');
// import fs from 'fs';
// import path from 'path';

module.exports = async (type, value) => {
    // Verify Logs folder exist
    if (!fs.existsSync(path.join(__dirname, '../logs'))) {
        fs.mkdirSync(path.join(__dirname, '../logs'));
    }

    switch (type) {
    case 'error':
        // Check if logfile exists
        if (!fs.existsSync(path.join(__dirname, '../logs', 'errorlog.log'))) {
            fs.writeFile(
                path.join(__dirname, '../logs', 'errorlog.log'),
                '',
                (err) => {
                    if (err) console.error(err);
                }
            );
        }

        fs.appendFile(
            path.join(__dirname, '../logs', 'errorlog.log'),
            value + '\n',
            (err) => {
                if (err) console.error(err);
            }
        );
        break;
    default:
        console.log('Other log type: ', value);
    }
};
