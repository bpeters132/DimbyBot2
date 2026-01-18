/**
 * @fileoverview This file sets up event listeners for the Lavalink Node Manager.
 * It handles various events related to node creation, destruction, connection status,
 * errors, and raw data flow.
 * @see https://tomato6966.github.io/lavalink-client/api/types/node/interfaces/nodemanagerevents/
 */

/**
 * Sets up event listeners for the Lavalink Node Manager.
 * @param {import('../lib/BotClient.js').default} client The bot client instance.
 */
export default async (client) => {
    client.lavalink.nodeManager
        /**
         * Node Lifecycle Events: Emitted during the creation and destruction phases of a node.
         */
        // Emitted when a new Lavalink node is successfully created and added to the manager.
        .on("create", (node) => {
            client.info(`Lavalink Node ${node.id} CREATED`)
        })
        // Emitted when a Lavalink node is destroyed, either manually or due to an error.
        // Includes an optional reason for the destruction.
        .on("destroy", (node, destroyReason) => {
            client.warn(
                `Lavalink Node ${node.id} DESTROYED${destroyReason ? ` Reason: ${destroyReason}` : ""}`
            )
        })

        /**
         * Connection Events: Emitted based on the connection status of a node.
         */
        // Emitted when a Lavalink node successfully connects to the Lavalink server.
        .on("connect", (node) => {
            client.info(`Lavalink Node ${node.id} CONNECTED`)
        })
        // Emitted when a Lavalink node disconnects from the Lavalink server.
        // Includes the disconnection code and reason.
        .on("disconnect", (node, reason) => {
            client.warn(
                `Lavalink Node ${node.id} DISCONNECTED. Code: ${reason.code}, Reason: ${reason.reason}`
            )
        })
        // Emitted when a disconnected Lavalink node starts attempting to reconnect.
        .on("reconnecting", (node) => {
            client.warn(`Lavalink Node ${node.id} RECONNECTING`)
        })
        // Emitted when a reconnection attempt is actively in progress for a node.
        .on("reconnectinprogress", (node) => {
            client.info(`Lavalink Node ${node.id} RECONNECT IN PROGRESS`)
        })
        // Emitted when a node connection is successfully resumed after a disconnection.
        // Provides the resume payload and potentially information about players that were active.
        .on("resumed", (node, payload, players) => {
            // eslint-disable-line no-unused-vars
            client.info(`Lavalink Node ${node.id} RESUMED. Payload: ${JSON.stringify(payload)}`)
            // Note: 'players' might be an array of LavalinkPlayer or an InvalidLavalinkRestRequest object.
            // Player state might need to be restored or re-initialized here based on the 'payload' and 'players' data.
        })

        /**
         * Error and Raw Data Events: For handling errors and observing raw data payloads.
         */
        // Emitted when an error occurs related to a specific Lavalink node.
        // Includes the error object and potentially the payload associated with the error.
        .on("error", (node, error, payload) => {
            client.error(
                `Lavalink Node ${node.id} ERRORED: ${error.message || error}${payload ? ` Payload: ${JSON.stringify(payload)}` : ""}`
            )
            // Logging the full error object can provide more detailed stack traces for debugging.
            console.error(error)
        })
        // Emitted for every raw message received from the Lavalink node. Useful for debugging.
        // This event can be very noisy and is typically commented out in production.
        .on("raw", (node, payload) => {
            // eslint-disable-line no-unused-vars
            client.debug(`Lavalink Node ${node.id} RAW: ${JSON.stringify(payload)}`)
        })
}
