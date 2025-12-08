import { BackendNode } from "./node";
import { parseNodeConfigFromEnv } from "./config";
import { logger, setLoggerNodeId } from "./utils";

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

// Parse configuration first
const { nodeId, config, peers } = parseNodeConfigFromEnv();

// Set logger prefix
setLoggerNodeId(nodeId);

logger.log("===========================================");
logger.log("  Distributed YouTube Watch-Together System");
logger.log("===========================================");

logger.log(`Starting node: ${nodeId}`);
logger.log(`Configuration:`, config);
logger.log(`Peers: ${peers.map((p) => p.nodeId).join(", ") || "none"}`);
logger.log("");

// Create and start the backend node
const node = new BackendNode(config, peers);
node.start();

// Handle graceful shutdown
process.on("SIGINT", () => {
    logger.log("\nShutting down...");
    node.stop();
    process.exit(0);
});

process.on("SIGTERM", () => {
    logger.log("\nShutting down...");
    node.stop();
    process.exit(0);
});

logger.log("\nPress Ctrl+C to stop the node.\n");
