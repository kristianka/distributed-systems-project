// Re-export shared room types
export {
    type PlaylistVideo,
    type ChatMessage,
    type PlaybackState,
    type Participant,
    type RoomState
} from "../../shared/types";

// Create initial room state
export const createRoomState = (roomCode: string, creatorId: string, creatorUsername: string) => {
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
                username: creatorUsername,
                joinedAt: Date.now(),
                isCreator: true
            }
        ],
        chatLog: []
    };
};
