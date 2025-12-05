// Import and re-export shared types
import { RoomMessageType, ClientMessageType, type RoomOperationPayload } from "../../shared/types";

export {
    RoomMessageType,
    ClientMessageType,
    type RoomCreatePayload,
    type RoomJoinPayload,
    type RoomLeavePayload,
    type PlaybackPlayPayload,
    type PlaybackPausePayload,
    type PlaybackSeekPayload,
    type PlaylistAddPayload,
    type PlaylistRemovePayload,
    type ChatMessagePayload,
    type RoomOperationPayload,
    type ClientMessage,
    type ServerMessage,
    type ErrorPayload,
    type RoomCreatedPayload,
    type RoomJoinedPayload,
    type RoomStateUpdatePayload,
    type PlaylistVideo,
    type ChatMessage,
    type PlaybackState,
    type Participant,
    type RoomState
} from "../../shared/types";

// Message types for Raft consensus
export enum RaftMessageType {
    REQUEST_VOTE = "REQUEST_VOTE",
    REQUEST_VOTE_RESP = "REQUEST_VOTE_RESP",
    APPEND_ENTRIES = "APPEND_ENTRIES",
    APPEND_ENTRIES_RESP = "APPEND_ENTRIES_RESP"
}

// Room operation message (for Raft log entries)
export interface RoomOperation {
    type: RoomMessageType;
    payload: RoomOperationPayload;
    timestamp: number;
}

// Raft consensus payloads
export interface RequestVotePayload {
    term: number;
    candidateId: string;
    lastLogIndex: number;
    lastLogTerm: number;
}

export interface RequestVoteResponse {
    term: number;
    voteGranted: boolean;
}

export interface LogEntry {
    term: number;
    index: number;
    operation: RoomOperation;
}

export interface AppendEntriesPayload {
    term: number;
    leaderId: string;
    prevLogIndex: number;
    prevLogTerm: number;
    entries: LogEntry[];
    leaderCommitIndex: number;
}

export interface AppendEntriesResponse {
    term: number;
    success: boolean;
    matchIndex: number;
}

// Operation acknowledgment
export interface OperationAck {
    operationId: string;
    success: boolean;
    commitIndex: number;
}

// Generic RPC message wrapper
export interface RpcMessage {
    type: RaftMessageType | RoomMessageType;
    payload: unknown;
    sourceNodeId: string;
    targetNodeId?: string;
    messageId: string;
}
