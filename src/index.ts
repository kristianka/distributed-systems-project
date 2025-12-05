import { BackendNode } from "./node";
import { parseNodeConfigFromEnv } from "./config";

/**
 * Main entry point for starting a backend node.
 *
 * Usage:
 *   bun run src/index.ts node-a
 *   bun run src/index.ts node-b
 *   bun run src/index.ts node-c
 *
 * Or set NODE_ID environment variable:
 *   NODE_ID=node-a bun run src/index.ts
 */

console.log("===========================================");
console.log("  Distributed YouTube Watch-Together System");
console.log("===========================================\n");

// Parse configuration
const { nodeId, config, peers } = parseNodeConfigFromEnv();

console.log(`Starting node: ${nodeId}`);
console.log(`Configuration:`, config);
console.log(`Peers:`, peers.map((p) => p.nodeId).join(", "));
console.log("");

// Create and start the backend node
const node = new BackendNode(config, peers);
node.start();

// Handle graceful shutdown
process.on("SIGINT", () => {
    console.log("\nShutting down...");
    node.stop();
    process.exit(0);
});

process.on("SIGTERM", () => {
    console.log("\nShutting down...");
    node.stop();
    process.exit(0);
});

console.log("\nPress Ctrl+C to stop the node.\n");
