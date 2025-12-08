import type { NodeConfig, RpcMessage, RaftMessageType, RoomMessageType } from "../types";
import { logger } from "../utils";

/**
 * RPC Client for inter-node communication over HTTP.
 * Used for Raft consensus messages between backend nodes.
 */
export class RpcClient {
    private nodeId: string;
    private peerNodes: Map<string, NodeConfig> = new Map();
    private messageIdCounter = 0;

    constructor(nodeId: string) {
        this.nodeId = nodeId;
    }

    /**
     * Register a peer node
     */
    registerPeer(config: NodeConfig): void {
        this.peerNodes.set(config.nodeId, config);
        logger.log(
            `[RPC ${this.nodeId}] Registered peer ${config.nodeId} at ${config.host}:${config.rpcPort}`
        );
    }

    /**
     * Send an RPC message to a peer node
     */
    async sendRpc(
        targetNodeId: string,
        message: { type: RaftMessageType | RoomMessageType; payload: unknown }
    ): Promise<unknown> {
        const peer = this.peerNodes.get(targetNodeId);
        if (!peer) {
            throw new Error(`Unknown peer node: ${targetNodeId}`);
        }

        const rpcMessage: RpcMessage = {
            type: message.type,
            payload: message.payload,
            sourceNodeId: this.nodeId,
            targetNodeId,
            messageId: `${this.nodeId}-${++this.messageIdCounter}`
        };

        const url = `http://${peer.host}:${peer.rpcPort}/rpc`;

        try {
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(rpcMessage)
            });

            if (!response.ok) {
                throw new Error(`RPC failed with status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            logger.error(`[RPC ${this.nodeId}] Failed to send RPC to ${targetNodeId}:`, error);
            throw error;
        }
    }

    /**
     * Get list of peer node IDs
     */
    getPeerNodeIds(): string[] {
        return Array.from(this.peerNodes.keys());
    }

    /**
     * Check health of a specific peer node
     */
    async checkPeerHealth(targetNodeId: string): Promise<boolean> {
        const peer = this.peerNodes.get(targetNodeId);
        if (!peer) {
            return false;
        }

        const url = `http://${peer.host}:${peer.rpcPort}/health`;

        try {
            const response = await fetch(url, {
                method: "GET",
                signal: AbortSignal.timeout(3000) // 3 second timeout
            });

            if (response.ok) {
                const data = (await response.json()) as { status: string; nodeId: string };
                return data.status === "ok" && data.nodeId === targetNodeId;
            }
            return false;
        } catch {
            return false;
        }
    }

    /**
     * Check health of all peer nodes and log results
     */
    async checkAllPeersHealth(): Promise<Map<string, boolean>> {
        const results = new Map<string, boolean>();
        const peerIds = this.getPeerNodeIds();

        logger.log(`[RPC ${this.nodeId}] Checking connectivity to ${peerIds.length} peer(s)...`);

        const checks = peerIds.map(async (peerId) => {
            const healthy = await this.checkPeerHealth(peerId);
            results.set(peerId, healthy);
            return { peerId, healthy };
        });

        const checkResults = await Promise.all(checks);

        for (const { peerId, healthy } of checkResults) {
            if (healthy) {
                logger.log(`[RPC ${this.nodeId}] ✅ Peer ${peerId} is reachable`);
            } else {
                logger.warn(`[RPC ${this.nodeId}] ❌ Peer ${peerId} is NOT reachable`);
            }
        }

        const healthyCount = checkResults.filter((r) => r.healthy).length;
        if (healthyCount === peerIds.length) {
            logger.log(
                `[RPC ${this.nodeId}] All peers reachable (${healthyCount}/${peerIds.length})`
            );
        } else if (healthyCount > 0) {
            logger.warn(
                `[RPC ${this.nodeId}] Some peers unreachable (${healthyCount}/${peerIds.length} online)`
            );
        } else {
            logger.warn(`[RPC ${this.nodeId}] No peers reachable - running in standalone mode`);
        }

        return results;
    }

    /**
     * Wait for all peers to become available, with retries
     * @param maxRetries Maximum number of retry attempts (0 = infinite)
     * @param retryDelayMs Delay between retries in milliseconds
     */
    async waitForPeers(maxRetries: number = 0, retryDelayMs: number = 3000): Promise<boolean> {
        const peerIds = this.getPeerNodeIds();
        if (peerIds.length === 0) {
            logger.log(`[RPC ${this.nodeId}] No peers configured, skipping connectivity check`);
            return true;
        }

        let attempt = 0;
        while (maxRetries === 0 || attempt < maxRetries) {
            attempt++;

            if (attempt > 1) {
                logger.log(
                    `[RPC ${this.nodeId}] Retry attempt ${attempt}${
                        maxRetries > 0 ? `/${maxRetries}` : ""
                    }...`
                );
            }

            const results = await this.checkAllPeersHealth();
            const allHealthy = Array.from(results.values()).every((healthy) => healthy);

            if (allHealthy) {
                return true;
            }

            // Wait before retrying
            logger.log(`[RPC ${this.nodeId}] Waiting ${retryDelayMs / 1000}s before retry...`);
            await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        }

        logger.warn(`[RPC ${this.nodeId}] Max retries reached, continuing with available peers`);
        return false;
    }
}

/**
 * RPC Server for handling incoming RPC messages from peer nodes.
 * Uses Bun's built-in HTTP server.
 */
export class RpcServer {
    private nodeId: string;
    private port: number;
    private server: ReturnType<typeof Bun.serve> | null = null;
    private messageHandler: ((message: RpcMessage) => Promise<unknown>) | null = null;

    constructor(nodeId: string, port: number) {
        this.nodeId = nodeId;
        this.port = port;
    }

    /**
     * Set the message handler
     */
    setMessageHandler(handler: (message: RpcMessage) => Promise<unknown>): void {
        this.messageHandler = handler;
    }

    /**
     * Start the RPC server
     */
    start(): void {
        this.server = Bun.serve({
            port: this.port,
            fetch: async (req) => {
                const url = new URL(req.url);

                if (url.pathname === "/rpc" && req.method === "POST") {
                    try {
                        const message = (await req.json()) as RpcMessage;

                        if (!this.messageHandler) {
                            return new Response(
                                JSON.stringify({ error: "No handler registered" }),
                                {
                                    status: 500,
                                    headers: { "Content-Type": "application/json" }
                                }
                            );
                        }

                        const response = await this.messageHandler(message);
                        return new Response(JSON.stringify(response), {
                            headers: { "Content-Type": "application/json" }
                        });
                    } catch (error) {
                        logger.error(`[RPC Server ${this.nodeId}] Error:`, error);
                        return new Response(JSON.stringify({ error: "Internal server error" }), {
                            status: 500,
                            headers: { "Content-Type": "application/json" }
                        });
                    }
                }

                if (url.pathname === "/health") {
                    return new Response(JSON.stringify({ status: "ok", nodeId: this.nodeId }), {
                        headers: { "Content-Type": "application/json" }
                    });
                }

                return new Response("Not Found", { status: 404 });
            }
        });

        logger.log(`[RPC Server ${this.nodeId}] Started on port ${this.port}`);
    }

    /**
     * Stop the RPC server
     */
    stop(): void {
        if (this.server) {
            this.server.stop();
            this.server = null;
            logger.log(`[RPC Server ${this.nodeId}] Stopped`);
        }
    }
}
