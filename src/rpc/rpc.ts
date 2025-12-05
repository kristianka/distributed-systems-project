import type { NodeConfig, RpcMessage, RaftMessageType, RoomMessageType } from "../types";

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
        console.log(
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
            console.error(`[RPC ${this.nodeId}] Failed to send RPC to ${targetNodeId}:`, error);
            throw error;
        }
    }

    /**
     * Get list of peer node IDs
     */
    getPeerNodeIds(): string[] {
        return Array.from(this.peerNodes.keys());
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
                        console.error(`[RPC Server ${this.nodeId}] Error:`, error);
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

        console.log(`[RPC Server ${this.nodeId}] Started on port ${this.port}`);
    }

    /**
     * Stop the RPC server
     */
    stop(): void {
        if (this.server) {
            this.server.stop();
            this.server = null;
            console.log(`[RPC Server ${this.nodeId}] Stopped`);
        }
    }
}
