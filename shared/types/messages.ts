// Message types for room operations (client -> server)
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

// Message types for server responses (server -> client)
export enum ClientMessageType {
    CONNECTED = "CONNECTED",
    ERROR = "ERROR",
    ROOM_CREATED = "ROOM_CREATED",
    ROOM_JOINED = "ROOM_JOINED",
    ROOM_LEFT = "ROOM_LEFT",
    ROOM_STATE_UPDATE = "ROOM_STATE_UPDATE",
    OPERATION_ACK = "OPERATION_ACK",
    OPERATION_REJECTED = "OPERATION_REJECTED",
    LEADER_CHANGED = "LEADER_CHANGED",
    USER_ID_SET = "USER_ID_SET"
}

// Room operation payloads
export interface RoomCreatePayload {
    roomCode?: string; // Optional: only set when broadcasting to other nodes
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

// Client-to-server message
export interface ClientMessage {
    type: RoomMessageType;
    payload: unknown;
}

// Server-to-client message
export interface ServerMessage {
    type: ClientMessageType;
    payload: unknown;
}

// Error payload
export interface ErrorPayload {
    message: string;
    code?: string;
}

// Room created response
export interface RoomCreatedPayload {
    roomCode: string;
    roomState: RoomState;
}

// Room joined response
export interface RoomJoinedPayload {
    roomCode: string;
    roomState: RoomState;
}

// Room state update
export interface RoomStateUpdatePayload {
    roomCode: string;
    roomState: RoomState;
}

// Video in the playlist
export interface PlaylistVideo {
    videoId: string;
    title?: string;
    addedBy: string;
    addedAt: number;
}

// Chat message
export interface ChatMessage {
    id: string;
    userId: string;
    messageText: string;
    timestamp: number;
}

// Playback state
export interface PlaybackState {
    isPlaying: boolean;
    currentVideoId: string | null;
    positionSeconds: number;
    lastUpdated: number;
}

// Participant in a room
export interface Participant {
    userId: string;
    joinedAt: number;
    isCreator: boolean;
}

// Complete room state
export interface RoomState {
    roomCode: string;
    createdAt: number;
    createdBy: string;
    playlist: PlaylistVideo[];
    playback: PlaybackState;
    participants: Participant[];
    chatLog: ChatMessage[];
}
