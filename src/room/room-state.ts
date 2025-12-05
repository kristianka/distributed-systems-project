import {
    type RoomState,
    type RoomOperation,
    type ChatMessage,
    RoomMessageType,
    createRoomState,
    type RoomCreatePayload,
    type RoomJoinPayload,
    type RoomLeavePayload,
    type PlaybackPlayPayload,
    type PlaybackPausePayload,
    type PlaybackSeekPayload,
    type PlaylistAddPayload,
    type PlaylistRemovePayload,
    type ChatMessagePayload
} from "../types";

/**
 * Manages the state of a single room.
 * Operations are applied after being committed through Raft consensus.
 */
export class RoomStateManager {
    private state: RoomState;
    private onStateChange: (state: RoomState) => void;

    constructor(roomCode: string, creatorId: string, onStateChange: (state: RoomState) => void) {
        this.state = createRoomState(roomCode, creatorId);
        this.onStateChange = onStateChange;
    }

    /**
     * Get current room state (immutable copy)
     */
    getState(): RoomState {
        return { ...this.state };
    }

    /**
     * Apply a committed operation to the room state
     */
    applyOperation(operation: RoomOperation): void {
        switch (operation.type) {
            case RoomMessageType.ROOM_CREATE:
                // Room already created in constructor
                break;

            case RoomMessageType.ROOM_JOIN:
                this.applyRoomJoin(operation.payload as RoomJoinPayload);
                break;

            case RoomMessageType.ROOM_LEAVE:
                this.applyRoomLeave(operation.payload as RoomLeavePayload);
                break;

            case RoomMessageType.PLAYBACK_PLAY:
                this.applyPlaybackPlay(operation.payload as PlaybackPlayPayload);
                break;

            case RoomMessageType.PLAYBACK_PAUSE:
                this.applyPlaybackPause(operation.payload as PlaybackPausePayload);
                break;

            case RoomMessageType.PLAYBACK_SEEK:
                this.applyPlaybackSeek(operation.payload as PlaybackSeekPayload);
                break;

            case RoomMessageType.PLAYLIST_ADD:
                this.applyPlaylistAdd(operation.payload as PlaylistAddPayload);
                break;

            case RoomMessageType.PLAYLIST_REMOVE:
                this.applyPlaylistRemove(operation.payload as PlaylistRemovePayload);
                break;

            case RoomMessageType.CHAT_MESSAGE:
                this.applyChatMessage(operation.payload as ChatMessagePayload);
                break;

            default:
                console.warn(`Unknown operation type: ${operation.type}`);
        }

        this.onStateChange(this.getState());
    }

    private applyRoomJoin(payload: RoomJoinPayload): void {
        // Check if user already in room
        const existing = this.state.participants.find((p) => p.userId === payload.userId);
        if (existing) return;

        this.state.participants.push({
            userId: payload.userId,
            joinedAt: Date.now(),
            isCreator: false
        });

        console.log(`[Room ${this.state.roomCode}] User ${payload.userId} joined`);
    }

    private applyRoomLeave(payload: RoomLeavePayload): void {
        this.state.participants = this.state.participants.filter(
            (p) => p.userId !== payload.userId
        );

        console.log(`[Room ${this.state.roomCode}] User ${payload.userId} left`);
    }

    private applyPlaybackPlay(payload: PlaybackPlayPayload): void {
        this.state.playback = {
            isPlaying: true,
            currentVideoId: payload.videoId,
            positionSeconds: payload.positionSeconds,
            lastUpdated: Date.now()
        };

        console.log(
            `[Room ${this.state.roomCode}] Playing video ${payload.videoId} at ${payload.positionSeconds}s`
        );
    }

    private applyPlaybackPause(payload: PlaybackPausePayload): void {
        this.state.playback = {
            ...this.state.playback,
            isPlaying: false,
            positionSeconds: payload.positionSeconds,
            lastUpdated: Date.now()
        };

        console.log(`[Room ${this.state.roomCode}] Paused at ${payload.positionSeconds}s`);
    }

    private applyPlaybackSeek(payload: PlaybackSeekPayload): void {
        this.state.playback = {
            ...this.state.playback,
            positionSeconds: payload.newPositionSeconds,
            lastUpdated: Date.now()
        };

        console.log(`[Room ${this.state.roomCode}] Seeked to ${payload.newPositionSeconds}s`);
    }

    private applyPlaylistAdd(payload: PlaylistAddPayload): void {
        const video = {
            videoId: payload.videoId,
            addedBy: "unknown", // Would come from the operation context
            addedAt: Date.now()
        };

        // Insert at specified position
        if (payload.newVideoPosition >= this.state.playlist.length) {
            this.state.playlist.push(video);
        } else {
            this.state.playlist.splice(payload.newVideoPosition, 0, video);
        }

        console.log(
            `[Room ${this.state.roomCode}] Added video ${payload.videoId} at position ${payload.newVideoPosition}`
        );
    }

    private applyPlaylistRemove(payload: PlaylistRemovePayload): void {
        this.state.playlist = this.state.playlist.filter((v) => v.videoId !== payload.videoId);

        console.log(`[Room ${this.state.roomCode}] Removed video ${payload.videoId}`);
    }

    private applyChatMessage(payload: ChatMessagePayload): void {
        const message: ChatMessage = {
            id: `${payload.timestamp}-${payload.userId}`,
            userId: payload.userId,
            messageText: payload.messageText,
            timestamp: payload.timestamp
        };

        this.state.chatLog.push(message);

        // Keep chat log from growing too large (last 1000 messages)
        if (this.state.chatLog.length > 1000) {
            this.state.chatLog = this.state.chatLog.slice(-1000);
        }

        console.log(
            `[Room ${this.state.roomCode}] Chat from ${payload.userId}: ${payload.messageText}`
        );
    }

    /**
     * Restore state from a snapshot (for replication)
     */
    restoreFromSnapshot(state: RoomState): void {
        this.state = { ...state };
        this.onStateChange(this.getState());
    }
}

/**
 * Generate a random 6-digit room code
 */
export function generateRoomCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
}
