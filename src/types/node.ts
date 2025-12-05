// Node configuration
export interface NodeConfig {
    nodeId: string;
    host: string;
    port: number;
    rpcPort: number; // Port for inter-node communication
}

// Cluster configuration
export interface ClusterConfig {
    nodes: NodeConfig[];
}

// Node role in Raft
export enum NodeRole {
    FOLLOWER = "FOLLOWER",
    CANDIDATE = "CANDIDATE",
    LEADER = "LEADER"
}

// Raft state for a specific room
export interface RaftRoomState {
    // Persistent state
    currentTerm: number;
    votedFor: string | null;
    log: import("./messages").LogEntry[];

    // Volatile state
    commitIndex: number;
    lastApplied: number;

    // Leader state (only valid if leader)
    nextIndex: Map<string, number>;
    matchIndex: Map<string, number>;

    // Current role
    role: NodeRole;
    leaderId: string | null;
}

// Create initial Raft state for a room
export function createRaftRoomState(): RaftRoomState {
    return {
        currentTerm: 0,
        votedFor: null,
        log: [],
        commitIndex: 0,
        lastApplied: 0,
        nextIndex: new Map(),
        matchIndex: new Map(),
        role: NodeRole.FOLLOWER,
        leaderId: null
    };
}
