import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import YouTube, { YouTubeEvent, YouTubePlayer } from "react-youtube";
import { useWebSocket } from "../hooks";
import { useNodeStatus } from "../context";
import { RoomState } from "../types";
import { Chat } from "../components/Chat";
import { Playlist } from "../components/Playlist";
import { Participants } from "../components/Participants";

interface RoomPageProps {
    userId: string;
    nodeUrl: string;
}

// Extract YouTube video ID from various URL formats
function extractVideoId(input: string): string | null {
    // If it's already just an ID (11 characters), return it
    if (/^[a-zA-Z0-9_-]{11}$/.test(input)) {
        return input;
    }

    // Try to extract from URL
    const patterns = [
        /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
        /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
        /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
        /(?:youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/
    ];

    for (const pattern of patterns) {
        const match = input.match(pattern);
        if (match) {
            return match[1];
        }
    }

    return null;
}

export function RoomPage({ userId, nodeUrl }: RoomPageProps) {
    const { roomCode } = useParams<{ roomCode: string }>();
    const navigate = useNavigate();

    const [roomState, setRoomState] = useState<RoomState | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [newVideoUrl, setNewVideoUrl] = useState("");
    const [isSyncing, setIsSyncing] = useState(false);

    const playerRef = useRef<YouTubePlayer | null>(null);
    const isRemoteUpdateRef = useRef(false);
    const lastSyncTimeRef = useRef(0);
    const lastPositionRef = useRef(0);
    const lastPositionTimeRef = useRef(Date.now());

    console.log("[RoomPage] Rendering for room code:", roomCode);
    console.log("[RoomPage] Current room state:", roomState);

    const handleRoomJoined = useCallback((_roomCode: string, state: RoomState) => {
        console.log("[RoomPage] Joined room with state:", state);
        setRoomState(state);
    }, []);

    const handleRoomStateUpdate = useCallback((state: RoomState) => {
        console.log("[RoomPage] State update:", state);
        setRoomState(state);

        // Sync video player with new state
        if (playerRef.current && state.playback) {
            const now = Date.now();
            // Throttle syncs to once per second
            if (now - lastSyncTimeRef.current < 1000) {
                return;
            }
            lastSyncTimeRef.current = now;

            isRemoteUpdateRef.current = true;
            setIsSyncing(true);

            const player = playerRef.current;
            const playback = state.playback;

            // Calculate current position accounting for time passed
            let targetPosition = playback.positionSeconds;
            if (playback.isPlaying) {
                const elapsed = (now - playback.lastUpdated) / 1000;
                targetPosition += elapsed;
            }

            // Get current player position
            const currentPosition = player.getCurrentTime?.() || 0;
            const positionDiff = Math.abs(currentPosition - targetPosition);

            // Only seek if difference is significant (>2 seconds)
            if (positionDiff > 2) {
                player.seekTo(targetPosition, true);
            }

            // Sync play/pause state
            const playerState = player.getPlayerState?.();
            const isCurrentlyPlaying = playerState === 1; // 1 = playing

            if (playback.isPlaying && !isCurrentlyPlaying) {
                player.playVideo();
            } else if (!playback.isPlaying && isCurrentlyPlaying) {
                player.pauseVideo();
            }

            setTimeout(() => {
                isRemoteUpdateRef.current = false;
                setIsSyncing(false);
            }, 500);
        }
    }, []);

    const handleError = useCallback((message: string) => {
        console.error("[RoomPage] Error:", message);
        setError(message);
    }, []);

    const { onConnectionLost } = useNodeStatus();

    const {
        isConnected,
        joinRoom,
        leaveRoom,
        play,
        pause,
        seek,
        addToPlaylist,
        removeFromPlaylist,
        sendChatMessage
    } = useWebSocket({
        url: nodeUrl,
        userId,
        onRoomJoined: handleRoomJoined,
        onRoomStateUpdate: handleRoomStateUpdate,
        onError: handleError,
        onConnectionLost
    });

    // Join room on mount
    useEffect(() => {
        if (roomCode && isConnected) {
            console.log("[RoomPage] Joining room:", roomCode);
            joinRoom(roomCode);
        }
    }, [roomCode, isConnected, joinRoom]);

    // Leave room on unmount
    useEffect(() => {
        return () => {
            if (roomCode) {
                leaveRoom(roomCode);
            }
        };
    }, [roomCode, leaveRoom]);

    const handlePlayerReady = (event: YouTubeEvent) => {
        playerRef.current = event.target;
    };

    const handlePlayerStateChange = (event: YouTubeEvent) => {
        // Ignore remote updates
        if (isRemoteUpdateRef.current || !roomCode || !roomState) {
            return;
        }

        const player = event.target;
        const state = event.data;
        const currentTime = player.getCurrentTime();
        const videoId = roomState.playback.currentVideoId || "";
        const now = Date.now();

        // Calculate expected position based on time elapsed
        const timeSinceLastUpdate = (now - lastPositionTimeRef.current) / 1000;
        const expectedPosition =
            lastPositionRef.current + (roomState.playback.isPlaying ? timeSinceLastUpdate : 0);
        const positionDiff = Math.abs(currentTime - expectedPosition);

        // Detect if this is a seek (position jumped more than 2 seconds from expected)
        const isSeek = positionDiff > 2;

        // Update position tracking
        lastPositionRef.current = currentTime;
        lastPositionTimeRef.current = now;

        // 1 = playing, 2 = paused
        if (state === 1) {
            // If this is a seek while playing, send seek then play
            if (isSeek) {
                console.log("[RoomPage] Local seek to", currentTime, "(resumed playing)");
                seek(roomCode, currentTime);
            }
            console.log("[RoomPage] Local play at", currentTime);
            play(roomCode, videoId, currentTime);
        } else if (state === 2) {
            // If this is a seek (scrubbing), only send seek, not pause
            if (isSeek) {
                console.log("[RoomPage] Local seek to", currentTime, "(while paused/scrubbing)");
                seek(roomCode, currentTime);
            } else {
                // This is a real pause (not scrubbing)
                console.log("[RoomPage] Local pause at", currentTime);
                pause(roomCode, currentTime);
            }
        }
    };

    const handleAddVideo = (e: React.FormEvent) => {
        e.preventDefault();
        if (!roomCode || !newVideoUrl.trim()) return;

        const videoId = extractVideoId(newVideoUrl.trim());
        if (!videoId) {
            setError("Invalid YouTube URL or video ID");
            return;
        }

        console.log("[RoomPage] Adding video:", videoId);
        addToPlaylist(roomCode, videoId);
        setNewVideoUrl("");
    };

    const handlePlayVideo = (videoId: string) => {
        if (!roomCode) return;
        play(roomCode, videoId, 0);
    };

    const handleRemoveVideo = (videoId: string, position: number) => {
        if (!roomCode) return;
        removeFromPlaylist(roomCode, videoId, position);
    };

    const handleSendMessage = (message: string) => {
        if (!roomCode) return;
        sendChatMessage(roomCode, message);
    };

    const handleLeaveRoom = () => {
        if (roomCode) {
            leaveRoom(roomCode);
        }
        navigate("/");
    };

    const copyRoomCode = () => {
        if (roomCode) {
            navigator.clipboard.writeText(roomCode);
        }
    };

    if (!roomCode) {
        return (
            <div className="flex items-center justify-center h-full text-red-400">
                Invalid room code
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full gap-4">
            {/* Header */}
            <div className="flex justify-between items-center px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-lg">
                <div>
                    <h2 className="text-xl font-semibold text-white">
                        Room:{" "}
                        <span
                            className="bg-blue-600 px-2 py-1 rounded cursor-pointer hover:bg-blue-700 transition-colors font-mono"
                            onClick={copyRoomCode}
                            title="Click to copy"
                        >
                            {roomCode}
                        </span>
                    </h2>
                    <div className="flex items-center gap-4 mt-1">
                        {isConnected ? (
                            <span className="text-emerald-400 text-sm">● Connected</span>
                        ) : (
                            <span className="text-red-400 text-sm">● Disconnected</span>
                        )}
                        {isSyncing && (
                            <span className="text-yellow-400 text-sm animate-pulse">
                                Syncing...
                            </span>
                        )}
                    </div>
                </div>
                <button
                    className="bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
                    onClick={handleLeaveRoom}
                >
                    Leave Room
                </button>
            </div>

            {/* Error Banner */}
            {error && (
                <div className="flex justify-between items-center bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg">
                    {error}
                    <button
                        className="text-red-400 hover:text-red-300 text-xl leading-none"
                        onClick={() => setError(null)}
                    >
                        ×
                    </button>
                </div>
            )}

            {/* Main Content */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_350px] gap-4 flex-1 min-h-0">
                {/* Video Section */}
                <div className="flex flex-col gap-4">
                    <div className="flex-1 min-h-[400px] bg-black rounded-lg overflow-hidden relative">
                        {roomState?.playback.currentVideoId ? (
                            <YouTube
                                videoId={roomState.playback.currentVideoId}
                                opts={{
                                    width: "100%",
                                    height: "100%",
                                    playerVars: {
                                        autoplay: roomState.playback.isPlaying ? 1 : 0,
                                        start: Math.floor(roomState.playback.positionSeconds),
                                        controls: 1,
                                        modestbranding: 1,
                                        rel: 0
                                    }
                                }}
                                onReady={handlePlayerReady}
                                onStateChange={handlePlayerStateChange}
                                className="absolute inset-0 w-full h-full"
                            />
                        ) : (
                            <div className="flex items-center justify-center h-full text-zinc-500">
                                <div className="text-center">
                                    <span className="text-6xl block mb-4">🎬</span>
                                    <p className="text-lg">No video playing</p>
                                    <p className="text-sm text-zinc-600">
                                        Add a video to the playlist to get started!
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Add Video Form */}
                    <form onSubmit={handleAddVideo} className="flex gap-2">
                        <input
                            type="text"
                            className="flex-1 bg-zinc-800 border border-zinc-700 focus:border-blue-500 text-white py-3 px-4 rounded-lg outline-none transition-colors placeholder:text-zinc-500"
                            placeholder="Paste YouTube URL or video ID..."
                            value={newVideoUrl}
                            onChange={(e) => setNewVideoUrl(e.target.value)}
                        />
                        <button
                            type="submit"
                            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-3 px-5 rounded-lg transition-colors whitespace-nowrap"
                            disabled={!newVideoUrl.trim()}
                        >
                            Add Video
                        </button>
                    </form>
                </div>

                {/* Sidebar */}
                <div className="flex flex-col gap-4 min-h-0 lg:max-h-full">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden max-h-52">
                        <Playlist
                            videos={roomState?.playlist || []}
                            currentVideoId={roomState?.playback.currentVideoId || null}
                            onPlayVideo={handlePlayVideo}
                            onRemoveVideo={handleRemoveVideo}
                        />
                    </div>

                    <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
                        <Participants
                            participants={roomState?.participants || []}
                            currentUserId={userId}
                        />
                    </div>

                    <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden flex-1 min-h-[250px] flex flex-col">
                        <Chat
                            messages={roomState?.chatLog || []}
                            currentUserId={userId}
                            onSendMessage={handleSendMessage}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
