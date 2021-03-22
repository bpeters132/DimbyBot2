const unirest = require("unirest");
const { firebase_rtdb_url, firebase_rtdb_url_dev_suffix } = require("../config.json")
const {google} = require("googleapis")

// Load the service account key JSON file.
var serviceAccount = require("../dimbybot-firebase-adminsdk-z6yus-458019424a.json");

// Define the required scopes.
var scopes = [
  "https://www.googleapis.com/auth/firebase.database"
];

// Authenticate a JWT client with the service account.
var jwtClient = new google.auth.JWT(
  serviceAccount.client_email,
  null,
  serviceAccount.private_key,
  scopes
);

// Use the JWT client to generate an access token.
var accessToken = jwtClient.authorize(function(error, tokens) {
  if (error) {
    console.log("Error making request to generate access token:", error);
  } else if (tokens.access_token === null) {
    console.log("Provided service account does not have permission to generate access tokens");
  } else {
    return tokens.access_token;

    // See the "Using the access token" section below for information
    // on how to use the access token to send authenticated requests to
    // the Realtime Database REST API.
  }
});

function readUserData(authorID) {
    return new Promise((resolve, reject) => {
        unirest('GET', `${firebase_rtdb_url}balances/${authorID}.json${firebase_rtdb_url_dev_suffix}?auth=${accessToken}`)
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
        unirest('PUT', `${firebase_rtdb_url}balances/${authorID}.json${firebase_rtdb_url_dev_suffix}?auth=${accessToken}`)
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
        unirest('PUT', `${firebase_rtdb_url}balances/${authorID}.json${firebase_rtdb_url_dev_suffix}?auth=${accessToken}`)
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
