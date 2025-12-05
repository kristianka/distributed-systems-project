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

// Create initial room state
export const createRoomState = (roomCode: string, creatorId: string) => {
    return {
        roomCode,
        createdAt: Date.now(),
        createdBy: creatorId,
        playlist: [],
        playback: {
            isPlaying: false,
            currentVideoId: null,
            positionSeconds: 0,
            lastUpdated: Date.now()
        },
        participants: [
            {
                userId: creatorId,
                joinedAt: Date.now(),
                isCreator: true
            }
        ],
        chatLog: []
    };
};
