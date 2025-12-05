/**
 * Simple test client to verify the distributed system is working.
 * Connects to a node and performs basic operations.
 */

import { logger } from "./utils";

const NODE_URL = process.env.NODE_URL ?? "ws://localhost:3001/ws";

logger.log("===========================================");
logger.log("  Test Client for Watch-Together System");
logger.log("===========================================");

logger.log(`Connecting to: ${NODE_URL}`);

const ws = new WebSocket(NODE_URL);

const userId = `user-${Math.random().toString(36).substring(7)}`;
let roomCode: string | null = null;

ws.onopen = () => {
    logger.log("✓ Connected to server");

    // Set user ID
    logger.log(`Setting user ID: ${userId}`);
    ws.send(
        JSON.stringify({
            type: "SET_USER_ID",
            payload: { userId }
        })
    );
};

ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    logger.log(`← Received: ${message.type}`);
    logger.log(`  Payload:`, JSON.stringify(message.payload, null, 2).split("\n").join("\n  "));

    // Handle specific messages
    switch (message.type) {
        case "USER_ID_SET":
            // Create a room after setting user ID
            logger.log("Creating a new room...");
            ws.send(
                JSON.stringify({
                    type: "CREATE_ROOM",
                    payload: {}
                })
            );
            break;

        case "ROOM_CREATED":
            roomCode = message.payload.roomCode;
            logger.log(`✓ Room created with code: ${roomCode}`);

            // Test some operations
            setTimeout(() => {
                logger.log("Adding a video to playlist...");
                ws.send(
                    JSON.stringify({
                        type: "PLAYLIST_ADD",
                        payload: { videoId: "dQw4w9WgXcQ", newVideoPosition: 0 }
                    })
                );
            }, 1000);

            setTimeout(() => {
                logger.log("Starting playback...");
                ws.send(
                    JSON.stringify({
                        type: "PLAYBACK_PLAY",
                        payload: { videoId: "dQw4w9WgXcQ", positionSeconds: 0 }
                    })
                );
            }, 2000);

            setTimeout(() => {
                logger.log("Sending a chat message...");
                ws.send(
                    JSON.stringify({
                        type: "CHAT_MESSAGE",
                        payload: { messageText: "Hello, everyone!" }
                    })
                );
            }, 3000);

            setTimeout(() => {
                logger.log("Seeking to position 30s...");
                ws.send(
                    JSON.stringify({
                        type: "PLAYBACK_SEEK",
                        payload: { newPositionSeconds: 30 }
                    })
                );
            }, 4000);

            setTimeout(() => {
                logger.log("Pausing playback...");
                ws.send(
                    JSON.stringify({
                        type: "PLAYBACK_PAUSE",
                        payload: { positionSeconds: 35 }
                    })
                );
            }, 5000);

            setTimeout(() => {
                logger.log("\n✓ Test sequence completed!");
                logger.log(`Room code: ${roomCode}`);
                logger.log("\nYou can connect another client to this room using:");
                logger.log(`  JOIN_ROOM with roomCode: "${roomCode}"`);
                logger.log("\nPress Ctrl+C to exit.");
            }, 6000);
            break;
    }
};

ws.onerror = (error) => {
    logger.error("WebSocket error:", error);
};

ws.onclose = () => {
    logger.log("Connection closed");
};

// Handle Ctrl+C
process.on("SIGINT", () => {
    logger.log("\nClosing connection...");
    ws.close();
    process.exit(0);
});
