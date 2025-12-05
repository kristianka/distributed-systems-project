// Message types for room operations
export enum RoomMessageType {
    ROOM_CREATE = "ROOM_CREATE",
    ROOM_JOIN = "ROOM_JOIN",
    ROOM_LEAVE = "ROOM_LEAVE",
    PLAYBACK_PLAY = "PLAYBACK_PLAY",
    PLAYBACK_PAUSE = "PLAYBACK_PAUSE",
    PLAYBACK_SEEK = "PLAYBACK_SEEK",
    PLAYLIST_ADD = "PLAYLIST_ADD",
    PLAYLIST_REMOVE = "PLAYLIST_REMOVE",
    CHAT_MESSAGE = "CHAT_MESSAGE"
}

// Message types for Raft consensus
export enum RaftMessageType {
    REQUEST_VOTE = "REQUEST_VOTE",
    REQUEST_VOTE_RESP = "REQUEST_VOTE_RESP",
    APPEND_ENTRIES = "APPEND_ENTRIES",
    APPEND_ENTRIES_RESP = "APPEND_ENTRIES_RESP"
}

// Room operation payloads
export interface RoomCreatePayload {
    roomCode: string;
    userId: string;
}

export interface RoomJoinPayload {
    roomCode: string;
    userId: string;
}

export interface RoomLeavePayload {
    roomCode: string;
    userId: string;
}

export interface PlaybackPlayPayload {
    roomCode: string;
    videoId: string;
    positionSeconds: number;
}

export interface PlaybackPausePayload {
    roomCode: string;
    positionSeconds: number;
}

export interface PlaybackSeekPayload {
    roomCode: string;
    newPositionSeconds: number;
}

export interface PlaylistAddPayload {
    roomCode: string;
    videoId: string;
    userId: string;
    newVideoPosition: number;
}

export interface PlaylistRemovePayload {
    roomCode: string;
    videoId: string;
    removedVideoPosition: number;
}

export interface ChatMessagePayload {
    roomCode: string;
    userId: string;
    messageText: string;
    timestamp: number;
}

// Union type for all room operation payloads
export type RoomOperationPayload =
    | RoomCreatePayload
    | RoomJoinPayload
    | RoomLeavePayload
    | PlaybackPlayPayload
    | PlaybackPausePayload
    | PlaybackSeekPayload
    | PlaylistAddPayload
    | PlaylistRemovePayload
    | ChatMessagePayload;

// Room operation message
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

// Client message types for acknowledgments
export enum ClientMessageType {
    CONNECTED = "CONNECTED",
    ERROR = "ERROR",
    ROOM_CREATED = "ROOM_CREATED",
    ROOM_JOINED = "ROOM_JOINED",
    ROOM_LEFT = "ROOM_LEFT",
    ROOM_STATE_UPDATE = "ROOM_STATE_UPDATE",
    OPERATION_ACK = "OPERATION_ACK",
    OPERATION_REJECTED = "OPERATION_REJECTED",
    LEADER_CHANGED = "LEADER_CHANGED"
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
