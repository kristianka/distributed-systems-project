import {
    type LogEntry,
    type RoomOperation,
    type AppendEntriesPayload,
    type AppendEntriesResponse,
    type RequestVotePayload,
    type RequestVoteResponse,
    RaftMessageType,
    NodeRole,
    type RaftRoomState,
    createRaftRoomState
} from "../types";
import { logger } from "../utils";

// Raft timing configuration
// Tuned for real-time playback sync (responsive but not excessive)
const ELECTION_TIMEOUT_MIN = 300; // ms
const ELECTION_TIMEOUT_MAX = 500; // ms
const HEARTBEAT_INTERVAL = 100; // ms

/**
 * Simplified Raft consensus implementation for a single room.
 * Each room has its own Raft instance for leader election and log replication.
 */
export class RaftConsensus {
    private state: RaftRoomState;
    private nodeId: string;
    private peerNodeIds: string[];
    private roomCode: string;

    // Timers
    private electionTimer: ReturnType<typeof setTimeout> | null = null;
    private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

    // Callbacks
    private onSendRpc: (
        targetNodeId: string,
        message: { type: RaftMessageType; payload: unknown }
    ) => Promise<unknown>;
    private onApplyOperation: (operation: RoomOperation) => void;
    private onLeaderChange: (leaderId: string | null) => void;

    constructor(
        nodeId: string,
        peerNodeIds: string[],
        roomCode: string,
        callbacks: {
            onSendRpc: (
                targetNodeId: string,
                message: { type: RaftMessageType; payload: unknown }
            ) => Promise<unknown>;
            onApplyOperation: (operation: RoomOperation) => void;
            onLeaderChange: (leaderId: string | null) => void;
        }
    ) {
        this.nodeId = nodeId;
        this.peerNodeIds = peerNodeIds;
        this.roomCode = roomCode;
        this.state = createRaftRoomState();
        this.onSendRpc = callbacks.onSendRpc;
        this.onApplyOperation = callbacks.onApplyOperation;
        this.onLeaderChange = callbacks.onLeaderChange;
    }

    /**
     * Start the Raft consensus algorithm
     */
    start(): void {
        logger.log(`[Raft ${this.roomCode}] Node ${this.nodeId} starting as follower`);
        this.resetElectionTimer();
    }

    /**
     * Stop the Raft consensus algorithm
     */
    stop(): void {
        this.clearElectionTimer();
        this.clearHeartbeatTimer();
    }

    /**
     * Get current role
     */
    getRole(): NodeRole {
        return this.state.role;
    }

    /**
     * Get current leader ID
     */
    getLeaderId(): string | null {
        return this.state.leaderId;
    }

    /**
     * Check if this node is the leader
     */
    isLeader(): boolean {
        return this.state.role === NodeRole.LEADER;
    }

    /**
     * Get current term
     */
    getCurrentTerm(): number {
        return this.state.currentTerm;
    }

    /**
     * Submit a new operation (only valid on leader)
     */
    async submitOperation(operation: RoomOperation): Promise<boolean> {
        if (!this.isLeader()) {
            logger.log(`[Raft ${this.roomCode}] Not leader, cannot submit operation`);
            return false;
        }

        // Append to log
        const entry: LogEntry = {
            term: this.state.currentTerm,
            index: this.state.log.length + 1,
            operation
        };
        this.state.log.push(entry);

        logger.log(`[Raft ${this.roomCode}] Leader appended entry at index ${entry.index}`);

        // Replicate to followers
        await this.replicateToFollowers();

        return true;
    }

    /**
     * Handle incoming RequestVote RPC
     */
    handleRequestVote(payload: RequestVotePayload): RequestVoteResponse {
        const { term, candidateId, lastLogIndex, lastLogTerm } = payload;

        // If term is outdated, reject
        if (term < this.state.currentTerm) {
            return { term: this.state.currentTerm, voteGranted: false };
        }

        // If higher term, update and become follower
        if (term > this.state.currentTerm) {
            this.becomeFollower(term);
        }

        // Check if we can vote for this candidate
        const canVote =
            (this.state.votedFor === null || this.state.votedFor === candidateId) &&
            this.isLogUpToDate(lastLogIndex, lastLogTerm);

        if (canVote) {
            this.state.votedFor = candidateId;
            this.resetElectionTimer();
            logger.log(
                `[Raft ${this.roomCode}] Node ${this.nodeId} voted for ${candidateId} in term ${term}`
            );
            return { term: this.state.currentTerm, voteGranted: true };
        }

        return { term: this.state.currentTerm, voteGranted: false };
    }

    /**
     * Handle incoming AppendEntries RPC
     */
    handleAppendEntries(payload: AppendEntriesPayload): AppendEntriesResponse {
        const { term, leaderId, prevLogIndex, prevLogTerm, entries, leaderCommitIndex } = payload;

        // If term is outdated, reject
        if (term < this.state.currentTerm) {
            return {
                term: this.state.currentTerm,
                success: false,
                matchIndex: 0
            };
        }

        // If higher term, step down to follower
        if (term > this.state.currentTerm) {
            this.becomeFollower(term);
        }

        // Update leader if changed (only notify on actual change)
        if (this.state.leaderId !== leaderId) {
            this.state.leaderId = leaderId;
            this.onLeaderChange(leaderId);
        }

        // If we're not a follower (e.g., we're a candidate), become follower
        if (this.state.role !== NodeRole.FOLLOWER) {
            this.becomeFollower(term);
        }

        this.resetElectionTimer();

        // Check log consistency
        if (prevLogIndex > 0) {
            if (prevLogIndex > this.state.log.length) {
                return {
                    term: this.state.currentTerm,
                    success: false,
                    matchIndex: this.state.log.length
                };
            }
            const prevEntry = this.state.log[prevLogIndex - 1];
            if (prevEntry && prevEntry.term !== prevLogTerm) {
                // Remove conflicting entries
                this.state.log = this.state.log.slice(0, prevLogIndex - 1);
                return {
                    term: this.state.currentTerm,
                    success: false,
                    matchIndex: this.state.log.length
                };
            }
        }

        // Append new entries
        for (const entry of entries) {
            if (entry.index > this.state.log.length) {
                this.state.log.push(entry);
            } else if (this.state.log[entry.index - 1]?.term !== entry.term) {
                // Replace conflicting entry
                this.state.log[entry.index - 1] = entry;
            }
        }

        // Update commit index
        if (leaderCommitIndex > this.state.commitIndex) {
            this.state.commitIndex = Math.min(leaderCommitIndex, this.state.log.length);
            this.applyCommittedEntries();
        }

        return {
            term: this.state.currentTerm,
            success: true,
            matchIndex: this.state.log.length
        };
    }

    /**
     * Check if candidate's log is at least as up-to-date as ours
     */
    private isLogUpToDate(lastLogIndex: number, lastLogTerm: number): boolean {
        const ourLastIndex = this.state.log.length;
        const ourLastTerm = ourLastIndex > 0 ? this.state.log[ourLastIndex - 1]!.term : 0;

        if (lastLogTerm !== ourLastTerm) {
            return lastLogTerm > ourLastTerm;
        }
        return lastLogIndex >= ourLastIndex;
    }

    /**
     * Become a follower
     */
    private becomeFollower(term: number): void {
        const wasAlreadyFollower =
            this.state.role === NodeRole.FOLLOWER && this.state.currentTerm === term;

        if (!wasAlreadyFollower) {
            logger.log(
                `[Raft ${this.roomCode}] Node ${this.nodeId} becoming follower in term ${term}`
            );
        }

        this.state.role = NodeRole.FOLLOWER;
        this.state.currentTerm = term;
        this.state.votedFor = null;
        this.clearHeartbeatTimer();
        this.resetElectionTimer();
    }

    /**
     * Become a candidate and start election
     */
    private becomeCandidate(): void {
        this.state.role = NodeRole.CANDIDATE;
        this.state.currentTerm++;
        this.state.votedFor = this.nodeId;
        this.state.leaderId = null;

        logger.log(
            `[Raft ${this.roomCode}] Node ${this.nodeId} becoming candidate in term ${this.state.currentTerm}`
        );

        this.startElection();
    }

    /**
     * Become the leader
     */
    private becomeLeader(): void {
        logger.log(
            `[Raft ${this.roomCode}] Node ${this.nodeId} becoming LEADER in term ${this.state.currentTerm}`
        );
        this.state.role = NodeRole.LEADER;
        this.state.leaderId = this.nodeId;

        // Initialize leader state
        this.state.nextIndex = new Map();
        this.state.matchIndex = new Map();
        for (const peerId of this.peerNodeIds) {
            this.state.nextIndex.set(peerId, this.state.log.length + 1);
            this.state.matchIndex.set(peerId, 0);
        }

        this.clearElectionTimer();
        this.onLeaderChange(this.nodeId);
        this.startHeartbeats();
    }

    /**
     * Start an election
     */
    private async startElection(): Promise<void> {
        const lastLogIndex = this.state.log.length;
        const lastLogTerm = lastLogIndex > 0 ? this.state.log[lastLogIndex - 1]!.term : 0;

        let votesReceived = 1; // Vote for self
        const votesNeeded = Math.floor((this.peerNodeIds.length + 1) / 2) + 1;

        const votePromises = this.peerNodeIds.map(async (peerId) => {
            try {
                const response = (await this.onSendRpc(peerId, {
                    type: RaftMessageType.REQUEST_VOTE,
                    payload: {
                        term: this.state.currentTerm,
                        candidateId: this.nodeId,
                        lastLogIndex,
                        lastLogTerm
                    } as RequestVotePayload
                })) as RequestVoteResponse;

                if (response.term > this.state.currentTerm) {
                    this.becomeFollower(response.term);
                    return;
                }

                if (response.voteGranted && this.state.role === NodeRole.CANDIDATE) {
                    votesReceived++;
                    if (votesReceived >= votesNeeded) {
                        this.becomeLeader();
                    }
                }
            } catch (error) {
                logger.log(`[Raft ${this.roomCode}] Failed to get vote from ${peerId}:`, error);
            }
        });

        await Promise.allSettled(votePromises);

        // If still candidate after election, reset timer for next attempt
        if (this.state.role === NodeRole.CANDIDATE) {
            this.resetElectionTimer();
        }
    }

    /**
     * Replicate log entries to followers
     */
    private async replicateToFollowers(): Promise<void> {
        const replicationPromises = this.peerNodeIds.map((peerId) =>
            this.replicateToFollower(peerId)
        );
        await Promise.allSettled(replicationPromises);

        // Update commit index based on majority
        this.updateCommitIndex();
    }

    /**
     * Replicate to a single follower
     */
    private async replicateToFollower(peerId: string): Promise<void> {
        const nextIndex = this.state.nextIndex.get(peerId) ?? 1;
        const prevLogIndex = nextIndex - 1;
        const prevLogTerm = prevLogIndex > 0 ? this.state.log[prevLogIndex - 1]?.term ?? 0 : 0;
        const entries = this.state.log.slice(nextIndex - 1);

        try {
            const response = (await this.onSendRpc(peerId, {
                type: RaftMessageType.APPEND_ENTRIES,
                payload: {
                    term: this.state.currentTerm,
                    leaderId: this.nodeId,
                    prevLogIndex,
                    prevLogTerm,
                    entries,
                    leaderCommitIndex: this.state.commitIndex
                } as AppendEntriesPayload
            })) as AppendEntriesResponse;

            if (response.term > this.state.currentTerm) {
                this.becomeFollower(response.term);
                return;
            }

            if (response.success) {
                this.state.nextIndex.set(peerId, response.matchIndex + 1);
                this.state.matchIndex.set(peerId, response.matchIndex);
            } else {
                // Decrement nextIndex and retry
                this.state.nextIndex.set(peerId, Math.max(1, nextIndex - 1));
            }
        } catch (error) {
            logger.log(`[Raft ${this.roomCode}] Failed to replicate to ${peerId}:`, error);
        }
    }

    /**
     * Update commit index based on majority replication
     */
    private updateCommitIndex(): void {
        for (let n = this.state.log.length; n > this.state.commitIndex; n--) {
            let replicationCount = 1; // Leader has it
            for (const peerId of this.peerNodeIds) {
                if ((this.state.matchIndex.get(peerId) ?? 0) >= n) {
                    replicationCount++;
                }
            }

            const majority = Math.floor((this.peerNodeIds.length + 1) / 2) + 1;
            if (
                replicationCount >= majority &&
                this.state.log[n - 1]?.term === this.state.currentTerm
            ) {
                this.state.commitIndex = n;
                this.applyCommittedEntries();
                break;
            }
        }
    }

    /**
     * Apply committed entries to state machine
     */
    private applyCommittedEntries(): void {
        while (this.state.lastApplied < this.state.commitIndex) {
            this.state.lastApplied++;
            const entry = this.state.log[this.state.lastApplied - 1];
            if (entry) {
                logger.log(`[Raft ${this.roomCode}] Applying entry at index ${entry.index}`);
                this.onApplyOperation(entry.operation);
            }
        }
    }

    /**
     * Start sending heartbeats (as leader)
     */
    private startHeartbeats(): void {
        this.clearHeartbeatTimer();
        this.sendHeartbeats();
        this.heartbeatTimer = setInterval(() => {
            this.sendHeartbeats();
        }, HEARTBEAT_INTERVAL);
    }

    /**
     * Send heartbeats to all followers
     */
    private sendHeartbeats(): void {
        if (!this.isLeader()) return;

        for (const peerId of this.peerNodeIds) {
            this.replicateToFollower(peerId).catch(() => {
                // Ignore errors in heartbeat
            });
        }
    }

    /**
     * Reset election timer
     */
    private resetElectionTimer(): void {
        this.clearElectionTimer();
        const timeout =
            ELECTION_TIMEOUT_MIN + Math.random() * (ELECTION_TIMEOUT_MAX - ELECTION_TIMEOUT_MIN);
        this.electionTimer = setTimeout(() => {
            if (this.state.role !== NodeRole.LEADER) {
                this.becomeCandidate();
            }
        }, timeout);
    }

    /**
     * Clear election timer
     */
    private clearElectionTimer(): void {
        if (this.electionTimer) {
            clearTimeout(this.electionTimer);
            this.electionTimer = null;
        }
    }

    /**
     * Clear heartbeat timer
     */
    private clearHeartbeatTimer(): void {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }
}
