import type { NodeConfig, ClusterConfig } from "../types";

/**
 * Cluster configuration for the distributed system.
 *
 * Requires CLUSTER_NODES environment variable:
 *   CLUSTER_NODES=node-a:localhost:8741:9741,node-b:localhost:8742:9742,node-c:localhost:8743:9743
 *
 * Format: nodeId:host:port:rpcPort,nodeId:host:port:rpcPort,...
 *
 * For production:
 *   CLUSTER_NODES=node-a:server1.example.com:8741:9741,node-b:server2.example.com:8741:9741
 */

/**
 * Parse nodes from CLUSTER_NODES environment variable.
 * Format: nodeId:host:port:rpcPort,nodeId:host:port:rpcPort,...
 */
function parseClusterNodes(): NodeConfig[] {
    const nodesEnv = process.env.CLUSTER_NODES;

    if (!nodesEnv) {
        throw new Error(
            "CLUSTER_NODES environment variable is required.\n" +
                "Format: nodeId:host:port:rpcPort,nodeId:host:port:rpcPort,...\n" +
                "Example: CLUSTER_NODES=node-a:localhost:8741:9741,node-b:localhost:8742:9742,node-c:localhost:8743:9743"
        );
    }

    const nodeStrings = nodesEnv
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

    return nodeStrings.map((nodeStr) => {
        const parts = nodeStr.split(":");
        if (parts.length !== 4) {
            throw new Error(`Invalid node format: ${nodeStr}. Expected: nodeId:host:port:rpcPort`);
        }

        const nodeId = parts[0]!;
        const host = parts[1]!;
        const port = parseInt(parts[2]!, 10);
        const rpcPort = parseInt(parts[3]!, 10);

        if (isNaN(port) || isNaN(rpcPort)) {
            throw new Error(`Invalid port numbers in node: ${nodeStr}`);
        }

        return { nodeId, host, port, rpcPort };
    });
}

/**
 * Get the cluster configuration (parsed from env or defaults)
 */
export const getClusterConfig = (): ClusterConfig => {
    return { nodes: parseClusterNodes() };
};

/**
 * Get the configuration for a specific node
 */
export const getNodeConfig = (nodeId: string): NodeConfig | undefined => {
    return getClusterConfig().nodes.find((n) => n.nodeId === nodeId);
};

/**
 * Get the peer configurations for a specific node
 */
export const getPeerConfigs = (nodeId: string): NodeConfig[] => {
    return getClusterConfig().nodes.filter((n) => n.nodeId !== nodeId);
};

/**
 * Parse node configuration from environment variables or command line.
 * Command line argument takes priority over NODE_ID env var.
 */
export const parseNodeConfigFromEnv = () => {
    // Command line arg takes priority, then env var, then default
    const nodeId = Bun.argv[2] ?? process.env.NODE_ID ?? "node-a";

    const config = getNodeConfig(nodeId);
    if (!config) {
        const availableNodes = getClusterConfig()
            .nodes.map((n) => n.nodeId)
            .join(", ");
        throw new Error(`Unknown node ID: ${nodeId}. Available nodes: ${availableNodes}`);
    }

    const peers = getPeerConfigs(nodeId);

    return { nodeId, config, peers };
};
