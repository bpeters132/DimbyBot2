const RedisServer = require("redis-server");
const server = new RedisServer(6379)
const redis = require("redis");
const client = redis.createClient();

server.open ((err) => {
    if (err == null) {
        console.log("Redis server listening")
    }
})

client.on("error", function (error) {
    console.error(error);
});

client.set("key", "value", redis.print);
client.get("key", redis.print);
