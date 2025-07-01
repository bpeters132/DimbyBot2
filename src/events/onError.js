/**
 * Enhanced error event handler with comprehensive error reporting
 * @param {import('../lib/BotClient').default} client
 */
export default async (client) => {
  // Handle Discord.js client errors
  client.on("error", (error) => {
    client.error(`Discord Client Error:`, error, {
      type: 'DISCORD_CLIENT_ERROR',
      timestamp: new Date().toISOString(),
      severity: 'HIGH'
    })
  })

  // Handle WebSocket errors
  client.on("warn", (warning) => {
    client.warn(`Discord Client Warning:`, warning, {
      type: 'DISCORD_CLIENT_WARNING',
      timestamp: new Date().toISOString(),
      severity: 'MEDIUM'
    })
  })

  // Handle shard errors if using sharding
  client.on("shardError", (error, shardId) => {
    client.error(`Shard ${shardId} Error:`, error, {
      type: 'SHARD_ERROR',
      shardId,
      timestamp: new Date().toISOString(),
      severity: 'HIGH'
    })
  })

  // Handle shard disconnect
  client.on("shardDisconnect", (event, shardId) => {
    client.warn(`Shard ${shardId} Disconnected:`, {
      event,
      shardId,
      type: 'SHARD_DISCONNECT',
      timestamp: new Date().toISOString(),
      severity: 'MEDIUM'
    })
  })

  // Handle shard reconnecting
  client.on("shardReconnecting", (shardId) => {
    client.info(`Shard ${shardId} Reconnecting`, {
      shardId,
      type: 'SHARD_RECONNECTING',
      timestamp: new Date().toISOString()
    })
  })

  // Handle rate limit warnings
  client.on("rateLimit", (rateLimitData) => {
    client.warn(`Rate Limit Hit:`, {
      ...rateLimitData,
      type: 'RATE_LIMIT',
      timestamp: new Date().toISOString(),
      severity: 'MEDIUM'
    })
  })

  // Handle debug information in debug mode
  client.on("debug", (message) => {
    if (process.env.LOG_LEVEL?.toLowerCase() === 'debug') {
      client.debug(`Discord Debug:`, message, {
        type: 'DISCORD_DEBUG',
        timestamp: new Date().toISOString()
      })
    }
  })
}
