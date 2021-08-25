const unirest = require("unirest");
const { firebase_rtdb_url, firebase_rtdb_url_dev_suffix } = require("../config.json")

function readUserData(authorID) {
    return new Promise((resolve, reject) => {
        unirest('GET', `${firebase_rtdb_url}balances/${authorID}.json${firebase_rtdb_url_dev_suffix}`)
            .headers({
                'Content-Type': 'application/json'
            })
            .send(JSON.stringify({}))
            .end(function (res) {
                if (res.error) reject(res.error);
                resolve(res.body);
            });
    });
}

function updateUserData(authorID, userData) {
    return new Promise((resolve, reject) => {
        unirest('PUT', `${firebase_rtdb_url}balances/${authorID}.json${firebase_rtdb_url_dev_suffix}`)
            .headers({
                'Content-Type': 'application/json'
            })
            .send(JSON.stringify(userData))
            .end(function (res) {
                if (res.error) reject(res.error);
                resolve(res.body);
            });
    })
}

function createUser(authorID) {
    return new Promise((resolve, reject) => {
        const payload = {
            balance: 7500,
            daily: 0,
            stocks: [0]
        };
        unirest('PUT', `${firebase_rtdb_url}balances/${authorID}.json${firebase_rtdb_url_dev_suffix}`)
            .headers({
                'Content-Type': 'application/json'
            })
            .send(JSON.stringify(payload))
            .end(function (res) {
                if (res.error) reject(res.error);
                resolve(res.body);
            });
    });
}

exports.createUser = createUser;
exports.readUserData = readUserData;
exports.updateUserData = updateUserData;
