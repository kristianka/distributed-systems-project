import {
    type NodeConfig,
    type RpcMessage,
    type RoomOperation,
    type RoomState,
    RaftMessageType,
    RoomMessageType,
    type RequestVotePayload,
    type AppendEntriesPayload,
    type RoomCreatePayload
} from "../types";
import { RaftConsensus } from "../consensus";
import { RoomStateManager, generateRoomCode } from "../room";
import { RpcClient, RpcServer } from "../rpc";
import { logger } from "../utils";

interface ClientConnection {
    id: string;
    userId: string;
    roomCode: string | null;
    ws: WebSocket & { send: (data: string) => void };
}

/**
 * Main backend node that handles:
 * - Client WebSocket connections
 * - Room management
 * - Raft consensus for each room
 * - Inter-node RPC communication
 */
export class BackendNode {
    private nodeId: string;
    private config: NodeConfig;
    private peerConfigs: NodeConfig[];

    // RPC layer
    private rpcClient: RpcClient;
    private rpcServer: RpcServer;

    // Room management
    private rooms: Map<string, RoomStateManager> = new Map();
    private roomRaft: Map<string, RaftConsensus> = new Map();

    // Client connections
    private clients: Map<string, ClientConnection> = new Map();

    // WebSocket server
    private wsServer: ReturnType<typeof Bun.serve> | null = null;

    constructor(config: NodeConfig, peerConfigs: NodeConfig[]) {
        this.nodeId = config.nodeId;
        this.config = config;
        this.peerConfigs = peerConfigs;

        // Initialize RPC
        this.rpcClient = new RpcClient(this.nodeId);
        this.rpcServer = new RpcServer(this.nodeId, config.rpcPort);

        // Register peers
        for (const peer of peerConfigs) {
            this.rpcClient.registerPeer(peer);
        }

        // Set up RPC message handler
        this.rpcServer.setMessageHandler(this.handleRpcMessage.bind(this));
    }

    /**
     * Start the backend node
     */
    start(): void {
        logger.log(`[Node ${this.nodeId}] Starting...`);

        // Start RPC server for inter-node communication
        this.rpcServer.start();

        // Start WebSocket server for client connections
        this.startWebSocketServer();

        logger.log(`[Node ${this.nodeId}] Ready`);
        logger.log(`  - Client WebSocket: ws://localhost:${this.config.port}`);
        logger.log(`  - RPC Server: http://localhost:${this.config.rpcPort}`);
    }

    /**
     * Stop the backend node
     */
    stop(): void {
        logger.log(`[Node ${this.nodeId}] Stopping...`);

        // Stop all Raft instances
        for (const raft of this.roomRaft.values()) {
            raft.stop();
        }

        // Stop servers
        this.rpcServer.stop();
        if (this.wsServer) {
            this.wsServer.stop();
        }

        logger.log(`[Node ${this.nodeId}] Stopped`);
    }

    /**
     * Start WebSocket server for client connections
     */
    private startWebSocketServer(): void {
        this.wsServer = Bun.serve({
            port: this.config.port,
            fetch(req, server) {
                const url = new URL(req.url);

                // Handle WebSocket upgrade
                if (url.pathname === "/ws") {
                    const upgraded = server.upgrade(req, {
                        data: { clientId: crypto.randomUUID() }
                    });
                    if (upgraded) {
                        return undefined;
                    }
                    return new Response("WebSocket upgrade failed", { status: 400 });
                }

                // Health check endpoint
                if (url.pathname === "/health") {
                    return new Response(JSON.stringify({ status: "ok" }), {
                        headers: { "Content-Type": "application/json" }
                    });
                }

                // API endpoints
                if (url.pathname === "/api/rooms" && req.method === "GET") {
                    return new Response(JSON.stringify({ rooms: [] }), {
                        headers: { "Content-Type": "application/json" }
                    });
                }

                return new Response("Not Found", { status: 404 });
            },
            websocket: {
                open: (ws) => {
                    const clientId = (ws.data as { clientId: string }).clientId;
                    logger.log(`[Node ${this.nodeId}] Client connected: ${clientId}`);

                    this.clients.set(clientId, {
                        id: clientId,
                        userId: "",
                        roomCode: null,
                        ws: ws as unknown as ClientConnection["ws"]
                    });

                    // Send welcome message
                    ws.send(
                        JSON.stringify({
                            type: "CONNECTED",
                            payload: { clientId, nodeId: this.nodeId }
                        })
                    );
                },
                message: (ws, message) => {
                    const clientId = (ws.data as { clientId: string }).clientId;
                    this.handleClientMessage(clientId, message.toString());
                },
                close: (ws) => {
                    const clientId = (ws.data as { clientId: string }).clientId;
                    logger.log(`[Node ${this.nodeId}] Client disconnected: ${clientId}`);

                    const client = this.clients.get(clientId);
                    if (client?.roomCode) {
                        this.handleLeaveRoom(clientId, client.roomCode);
                    }
                    this.clients.delete(clientId);
                }
            }
        });

        logger.log(`[Node ${this.nodeId}] WebSocket server started on port ${this.config.port}`);
    }

    /**
     * Handle incoming RPC message from another node
     */
    private async handleRpcMessage(message: RpcMessage): Promise<unknown> {
        logger.log(
            `[Node ${this.nodeId}] Received RPC: ${message.type} from ${message.sourceNodeId}`
        );

        // Extract room code from message if present
        const payload = message.payload as Record<string, unknown>;
        const roomCode = payload.roomCode as string | undefined;

        // Handle Raft messages
        if (message.type === RaftMessageType.REQUEST_VOTE) {
            const votePayload = message.payload as RequestVotePayload;
            // For REQUEST_VOTE, we need to find or create the room's Raft instance
            // In a real implementation, we'd have room context in the message
            // For now, we'll handle it at the cluster level
            const raft = roomCode ? this.roomRaft.get(roomCode) : null;
            if (raft) {
                return raft.handleRequestVote(votePayload);
            }
            return { term: 0, voteGranted: false };
        }

        if (message.type === RaftMessageType.APPEND_ENTRIES) {
            const entriesPayload = message.payload as AppendEntriesPayload;
            const raft = roomCode ? this.roomRaft.get(roomCode) : null;
            if (raft) {
                return raft.handleAppendEntries(entriesPayload);
            }
            return { term: 0, success: false, matchIndex: 0 };
        }

        // Handle room operation messages (for creating rooms on follower nodes)
        if (message.type === RoomMessageType.ROOM_CREATE) {
            const createPayload = message.payload as RoomCreatePayload;
            this.createRoom(createPayload.roomCode, createPayload.userId);
            return { success: true };
        }

        return { error: "Unknown message type" };
    }

    /**
     * Handle incoming message from a client
     */
    private handleClientMessage(clientId: string, rawMessage: string): void {
        try {
            const message = JSON.parse(rawMessage) as {
                type: string;
                payload: Record<string, unknown>;
            };

            logger.log(`[Node ${this.nodeId}] Client ${clientId} message: ${message.type}`);

            switch (message.type) {
                case "SET_USER_ID":
                    this.handleSetUserId(clientId, message.payload.userId as string);
                    break;

                case "CREATE_ROOM":
                    this.handleCreateRoom(clientId);
                    break;

                case "JOIN_ROOM":
                    this.handleJoinRoom(clientId, message.payload.roomCode as string);
                    break;

                case "LEAVE_ROOM":
                    this.handleLeaveRoom(clientId, message.payload.roomCode as string);
                    break;

                case "PLAYBACK_PLAY":
                case "PLAYBACK_PAUSE":
                case "PLAYBACK_SEEK":
                case "PLAYLIST_ADD":
                case "PLAYLIST_REMOVE":
                case "CHAT_MESSAGE":
                    this.handleRoomOperation(clientId, message.type, message.payload);
                    break;

                default:
                    logger.warn(`Unknown client message type: ${message.type}`);
            }
        } catch (error) {
            logger.error(`[Node ${this.nodeId}] Error handling client message:`, error);
        }
    }

    /**
     * Set user ID for a client
     */
    private handleSetUserId(clientId: string, userId: string): void {
        const client = this.clients.get(clientId);
        if (client) {
            client.userId = userId;
            this.sendToClient(clientId, {
                type: "USER_ID_SET",
                payload: { userId }
            });
        }
    }

    /**
     * Handle room creation request
     */
    private handleCreateRoom(clientId: string): void {
        const client = this.clients.get(clientId);
        if (!client || !client.userId) {
            this.sendToClient(clientId, {
                type: "ERROR",
                payload: { message: "User ID not set" }
            });
            return;
        }

        const roomCode = generateRoomCode();
        this.createRoom(roomCode, client.userId);

        // Join the client to the room
        client.roomCode = roomCode;

        // Notify other nodes to create the room
        this.broadcastToNodes({
            type: RoomMessageType.ROOM_CREATE,
            payload: { roomCode, userId: client.userId }
        });

        this.sendToClient(clientId, {
            type: "ROOM_CREATED",
            payload: { roomCode, state: this.rooms.get(roomCode)?.getState() }
        });

        logger.log(`[Node ${this.nodeId}] Room ${roomCode} created by ${client.userId}`);
    }

    /**
     * Create a room on this node
     */
    private createRoom(roomCode: string, creatorId: string): void {
        if (this.rooms.has(roomCode)) {
            logger.log(`[Node ${this.nodeId}] Room ${roomCode} already exists`);
            return;
        }

        // Create room state manager
        const roomState = new RoomStateManager(roomCode, creatorId, (state) =>
            this.broadcastRoomState(roomCode, state)
        );
        this.rooms.set(roomCode, roomState);

        // Create Raft consensus for this room
        const raft = new RaftConsensus(this.nodeId, this.rpcClient.getPeerNodeIds(), roomCode, {
            onSendRpc: async (targetNodeId, message) => {
                // Add room code to the payload for routing
                const payload = message.payload as Record<string, unknown>;
                payload.roomCode = roomCode;
                return this.rpcClient.sendRpc(targetNodeId, message);
            },
            onApplyOperation: (operation) => {
                roomState.applyOperation(operation);
            },
            onLeaderChange: (leaderId) => {
                logger.log(`[Node ${this.nodeId}] Room ${roomCode} leader changed to ${leaderId}`);
                this.broadcastToRoom(roomCode, {
                    type: "LEADER_CHANGED",
                    payload: { roomCode, leaderId }
                });
            }
        });
        this.roomRaft.set(roomCode, raft);

        // Start Raft consensus
        raft.start();

        logger.log(`[Node ${this.nodeId}] Room ${roomCode} initialized`);
    }

    /**
     * Handle join room request
     */
    private handleJoinRoom(clientId: string, roomCode: string): void {
        const client = this.clients.get(clientId);
        if (!client || !client.userId) {
            this.sendToClient(clientId, {
                type: "ERROR",
                payload: { message: "User ID not set" }
            });
            return;
        }

        const room = this.rooms.get(roomCode);
        if (!room) {
            this.sendToClient(clientId, {
                type: "ERROR",
                payload: { message: "Room not found" }
            });
            return;
        }

        client.roomCode = roomCode;

        // Submit join operation through Raft
        const raft = this.roomRaft.get(roomCode);
        if (raft?.isLeader()) {
            const operation: RoomOperation = {
                type: RoomMessageType.ROOM_JOIN,
                payload: { roomCode, userId: client.userId },
                timestamp: Date.now()
            };
            raft.submitOperation(operation);
        } else {
            // Forward to leader
            const leaderId = raft?.getLeaderId();
            if (leaderId) {
                const operation: RoomOperation = {
                    type: RoomMessageType.ROOM_JOIN,
                    payload: { roomCode, userId: client.userId },
                    timestamp: Date.now()
                };
                this.forwardToLeader(leaderId, operation).catch((error) => {
                    logger.error(`[Node ${this.nodeId}] Failed to forward join to leader:`, error);
                });
            }
        }

        this.sendToClient(clientId, {
            type: "ROOM_JOINED",
            payload: { roomCode, state: room.getState() }
        });

        logger.log(`[Node ${this.nodeId}] User ${client.userId} joined room ${roomCode}`);
    }

    /**
     * Handle leave room request
     */
    private handleLeaveRoom(clientId: string, roomCode: string): void {
        const client = this.clients.get(clientId);
        if (!client) return;

        const room = this.rooms.get(roomCode);
        if (!room) return;

        // Submit leave operation
        const raft = this.roomRaft.get(roomCode);
        const operation: RoomOperation = {
            type: RoomMessageType.ROOM_LEAVE,
            payload: { roomCode, userId: client.userId },
            timestamp: Date.now()
        };

        if (raft?.isLeader()) {
            raft.submitOperation(operation);
        } else {
            // Forward to leader
            const leaderId = raft?.getLeaderId();
            if (leaderId) {
                this.forwardToLeader(leaderId, operation).catch((error) => {
                    logger.error(`[Node ${this.nodeId}] Failed to forward leave to leader:`, error);
                });
            }
        }

        client.roomCode = null;

        this.sendToClient(clientId, {
            type: "ROOM_LEFT",
            payload: { roomCode }
        });
    }

    /**
     * Handle room operation (playback, playlist, chat)
     */
    private handleRoomOperation(
        clientId: string,
        type: string,
        payload: Record<string, unknown>
    ): void {
        const client = this.clients.get(clientId);
        if (!client || !client.roomCode) {
            this.sendToClient(clientId, {
                type: "ERROR",
                payload: { message: "Not in a room" }
            });
            return;
        }

        const roomCode = client.roomCode;
        const room = this.rooms.get(roomCode);
        const raft = this.roomRaft.get(roomCode);

        if (!room) {
            this.sendToClient(clientId, {
                type: "ERROR",
                payload: { message: "Room not found" }
            });
            return;
        }

        // Add user ID and room code to payload
        const fullPayload = {
            ...payload,
            roomCode,
            userId: client.userId,
            timestamp: Date.now()
        };

        const operation: RoomOperation = {
            type: type as RoomMessageType,
            payload: fullPayload,
            timestamp: Date.now()
        };

        // Submit through Raft if leader, otherwise forward to leader
        if (raft?.isLeader()) {
            raft.submitOperation(operation);
        } else {
            // Forward to leader
            const leaderId = raft?.getLeaderId();
            if (leaderId) {
                this.forwardToLeader(leaderId, operation).catch((error) => {
                    logger.error(`[Node ${this.nodeId}] Failed to forward to leader:`, error);
                    this.sendToClient(clientId, {
                        type: "ERROR",
                        payload: { message: "Failed to process operation - leader unavailable" }
                    });
                });
            } else {
                // No leader elected yet
                this.sendToClient(clientId, {
                    type: "ERROR",
                    payload: { message: "No leader available - please try again" }
                });
            }
        }
    }

    /**
     * Forward an operation to the leader node
     */
    private async forwardToLeader(leaderId: string, operation: RoomOperation): Promise<void> {
        await this.rpcClient.sendRpc(leaderId, {
            type: operation.type,
            payload: operation.payload
        });
    }

    /**
     * Broadcast room state to all clients in the room
     */
    private broadcastRoomState(roomCode: string, state: RoomState): void {
        this.broadcastToRoom(roomCode, {
            type: "ROOM_STATE_UPDATE",
            payload: { roomCode, state }
        });
    }

    /**
     * Broadcast message to all clients in a room
     */
    private broadcastToRoom(roomCode: string, message: { type: string; payload: unknown }): void {
        for (const client of this.clients.values()) {
            if (client.roomCode === roomCode) {
                this.sendToClient(client.id, message);
            }
        }
    }

    /**
     * Broadcast room creation to other nodes
     */
    private broadcastToNodes(message: { type: RoomMessageType; payload: unknown }): void {
        for (const peerId of this.rpcClient.getPeerNodeIds()) {
            this.rpcClient.sendRpc(peerId, message).catch((error) => {
                logger.error(`[Node ${this.nodeId}] Failed to broadcast to ${peerId}:`, error);
            });
        }
    }

    /**
     * Send message to a specific client
     */
    private sendToClient(clientId: string, message: { type: string; payload: unknown }): void {
        const client = this.clients.get(clientId);
        if (client) {
            try {
                client.ws.send(JSON.stringify(message));
            } catch (error) {
                logger.error(`[Node ${this.nodeId}] Failed to send to client ${clientId}:`, error);
            }
        }
    }
}
