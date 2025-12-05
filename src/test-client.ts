/**
 * Simple test client to verify the distributed system is working.
 * Connects to a node and performs basic operations.
 */

const NODE_URL = process.env.NODE_URL ?? "ws://localhost:3001/ws";

console.log("===========================================");
console.log("  Test Client for Watch-Together System");
console.log("===========================================\n");

console.log(`Connecting to: ${NODE_URL}\n`);

const ws = new WebSocket(NODE_URL);

const userId = `user-${Math.random().toString(36).substring(7)}`;
let roomCode: string | null = null;

ws.onopen = () => {
    console.log("✓ Connected to server\n");

    // Set user ID
    console.log(`Setting user ID: ${userId}`);
    ws.send(
        JSON.stringify({
            type: "SET_USER_ID",
            payload: { userId }
        })
    );
};

ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    console.log(`← Received: ${message.type}`);
    console.log(`  Payload:`, JSON.stringify(message.payload, null, 2).split("\n").join("\n  "));
    console.log("");

    // Handle specific messages
    switch (message.type) {
        case "USER_ID_SET":
            // Create a room after setting user ID
            console.log("Creating a new room...");
            ws.send(
                JSON.stringify({
                    type: "CREATE_ROOM",
                    payload: {}
                })
            );
            break;

        case "ROOM_CREATED":
            roomCode = message.payload.roomCode;
            console.log(`✓ Room created with code: ${roomCode}\n`);

            // Test some operations
            setTimeout(() => {
                console.log("Adding a video to playlist...");
                ws.send(
                    JSON.stringify({
                        type: "PLAYLIST_ADD",
                        payload: { videoId: "dQw4w9WgXcQ", newVideoPosition: 0 }
                    })
                );
            }, 1000);

            setTimeout(() => {
                console.log("Starting playback...");
                ws.send(
                    JSON.stringify({
                        type: "PLAYBACK_PLAY",
                        payload: { videoId: "dQw4w9WgXcQ", positionSeconds: 0 }
                    })
                );
            }, 2000);

            setTimeout(() => {
                console.log("Sending a chat message...");
                ws.send(
                    JSON.stringify({
                        type: "CHAT_MESSAGE",
                        payload: { messageText: "Hello, everyone!" }
                    })
                );
            }, 3000);

            setTimeout(() => {
                console.log("Seeking to position 30s...");
                ws.send(
                    JSON.stringify({
                        type: "PLAYBACK_SEEK",
                        payload: { newPositionSeconds: 30 }
                    })
                );
            }, 4000);

            setTimeout(() => {
                console.log("Pausing playback...");
                ws.send(
                    JSON.stringify({
                        type: "PLAYBACK_PAUSE",
                        payload: { positionSeconds: 35 }
                    })
                );
            }, 5000);

            setTimeout(() => {
                console.log("\n✓ Test sequence completed!");
                console.log(`Room code: ${roomCode}`);
                console.log("\nYou can connect another client to this room using:");
                console.log(`  JOIN_ROOM with roomCode: "${roomCode}"\n`);
                console.log("Press Ctrl+C to exit.\n");
            }, 6000);
            break;
    }
};

ws.onerror = (error) => {
    console.error("WebSocket error:", error);
};

ws.onclose = () => {
    console.log("Connection closed");
};

// Handle Ctrl+C
process.on("SIGINT", () => {
    console.log("\nClosing connection...");
    ws.close();
    process.exit(0);
});
