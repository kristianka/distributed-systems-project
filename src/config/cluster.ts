import type { NodeConfig, ClusterConfig } from "../types";

/**
 * Default cluster configuration for local development.
 * Three nodes running on localhost with different ports.
 */
export const DEFAULT_CLUSTER_CONFIG: ClusterConfig = {
    nodes: [
        {
            nodeId: "node-a",
            host: "localhost",
            port: 3001, // Client WebSocket port
            rpcPort: 4001 // Inter-node RPC port
        },
        {
            nodeId: "node-b",
            host: "localhost",
            port: 3002,
            rpcPort: 4002
        },
        {
            nodeId: "node-c",
            host: "localhost",
            port: 3003,
            rpcPort: 4003
        }
    ]
};

/**
 * Get the configuration for a specific node
 */
export const getNodeConfig = (nodeId: string) => {
    return DEFAULT_CLUSTER_CONFIG.nodes.find((n) => n.nodeId === nodeId);
};

/**
 * Get the peer configurations for a specific node
 */
export const getPeerConfigs = (nodeId: string) => {
    return DEFAULT_CLUSTER_CONFIG.nodes.filter((n) => n.nodeId !== nodeId);
};

/**
 * Parse node configuration from environment variables or command line
 */
export const parseNodeConfigFromEnv = () => {
    const nodeId = process.env.NODE_ID ?? Bun.argv[2] ?? "node-a";

    const config = getNodeConfig(nodeId);
    if (!config) {
        throw new Error(`Unknown node ID: ${nodeId}`);
    }

    const peers = getPeerConfigs(nodeId);

    return { nodeId, config, peers };
};
