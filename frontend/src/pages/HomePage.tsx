import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWebSocket } from "../hooks";
import { useNodeStatus } from "../context";
import { RoomState } from "../types";
import { Features } from "../components/Features";
import { Footer } from "../components/Footer";

interface HomePageProps {
    userId: string;
    username: string;
    nodeUrl: string;
    connectionFailed?: boolean;
    onRetry?: () => void;
}

export function HomePage({ userId, username, nodeUrl, connectionFailed, onRetry }: HomePageProps) {
    const navigate = useNavigate();
    const [joinCode, setJoinCode] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [isJoining, setIsJoining] = useState(false);

    const handleRoomCreated = (roomCode: string, _state: RoomState) => {
        console.log("[HomePage] Room created:", roomCode);
        setIsCreating(false);
        navigate(`/room/${roomCode}`);
    };

    const handleRoomJoined = (roomCode: string, _state: RoomState) => {
        console.log("[HomePage] Joined room:", roomCode);
        setIsJoining(false);
        navigate(`/room/${roomCode}`);
    };

    const handleError = (message: string) => {
        console.error("[HomePage] Error:", message);
        setError(message);
        setIsCreating(false);
        setIsJoining(false);
    };

    const { onConnectionLost } = useNodeStatus();

    const { isConnected, createRoom, joinRoom } = useWebSocket({
        url: nodeUrl,
        userId,
        username,
        onRoomCreated: handleRoomCreated,
        onRoomJoined: handleRoomJoined,
        onError: handleError,
        onConnectionLost
    });

    const handleCreateRoom = () => {
        setError(null);
        setIsCreating(true);
        createRoom();
    };

    const handleJoinRoom = (e: React.FormEvent) => {
        e.preventDefault();
        if (!joinCode.trim()) {
            setError("Please enter a room code");
            return;
        }
        if (joinCode.length !== 6) {
            setError("Room code must be 6 characters");
            return;
        }
        setError(null);
        setIsJoining(true);
        joinRoom(joinCode.toUpperCase());
    };

    return (
        <div className="flex justify-center items-center min-h-full mt-8">
            <div className="max-w-xl w-full">
                {/* Welcome Section */}
                <div className="text-center mb-8">
                    <h2 className="text-3xl font-bold text-white mb-2">
                        Welcome to Watch Together!
                    </h2>
                    <p className="text-zinc-400 text-lg">
                        Watch YouTube videos with friends in real-time sync.
                    </p>

                    <div className="mt-4">
                        {connectionFailed ? (
                            <span className="text-red-400 text-sm bg-red-400/10 px-3 py-1 rounded-full">
                                ● Disconnected
                            </span>
                        ) : isConnected ? (
                            <span className="text-emerald-400 text-sm bg-emerald-400/10 px-3 py-1 rounded-full">
                                ● Connected
                            </span>
                        ) : (
                            <span className="text-yellow-400 text-sm bg-yellow-400/10 px-3 py-1 rounded-full">
                                ● Connecting...
                            </span>
                        )}
                    </div>
                </div>

                {/* Connection Failed Banner */}
                {connectionFailed && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-6">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <span className="text-red-400 text-xl">⚠️</span>
                                <div>
                                    <p className="text-red-400 font-medium">Connection Failed</p>
                                    <p className="text-red-400/70 text-sm">
                                        Could not connect to any server
                                    </p>
                                </div>
                            </div>
                            {onRetry && (
                                <button
                                    onClick={onRetry}
                                    className="bg-red-500/20 hover:bg-red-500/30 text-red-400 font-medium py-2 px-4 rounded-lg transition-colors text-sm"
                                >
                                    Retry
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {/* Error Message */}
                {error && (
                    <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg mb-6 text-center">
                        {error}
                    </div>
                )}

                {/* Actions */}
                <div className="flex flex-col gap-6 mb-8">
                    {/* Create Room Card */}
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-center">
                        <h3 className="text-xl font-semibold text-white mb-2">Create a Room</h3>
                        <p className="text-zinc-400 text-sm mb-4">
                            Start a new watch party and invite friends
                        </p>
                        <button
                            className="w-full bg-violet-500 hover:bg-violet-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors"
                            onClick={handleCreateRoom}
                            disabled={!isConnected || isCreating}
                        >
                            {isCreating ? "Creating..." : "Create Room"}
                        </button>
                    </div>

                    {/* Divider */}
                    <div className="flex items-center gap-4">
                        <div className="flex-1 h-px bg-zinc-800" />
                        <span className="text-zinc-500 text-sm">OR</span>
                        <div className="flex-1 h-px bg-zinc-800" />
                    </div>

                    {/* Join Room Card */}
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-center">
                        <h3 className="text-xl font-semibold text-white mb-2">Join a Room</h3>
                        <p className="text-zinc-400 text-sm mb-4">
                            Enter a 6-digit code to join an existing room
                        </p>
                        <form onSubmit={handleJoinRoom} className="space-y-3">
                            <input
                                type="text"
                                className="w-full bg-zinc-800 border-2 border-zinc-700 focus:border-violet-500 text-white text-xl text-center tracking-widest uppercase py-3 px-4 rounded-lg outline-none transition-colors placeholder:text-zinc-500 placeholder:tracking-normal placeholder:normal-case"
                                placeholder="Enter room code"
                                value={joinCode}
                                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                                maxLength={6}
                                disabled={!isConnected || isJoining}
                            />
                            <button
                                type="submit"
                                className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors"
                                disabled={!isConnected || isJoining || !joinCode.trim()}
                            >
                                {isJoining ? "Joining..." : "Join Room"}
                            </button>
                        </form>
                    </div>
                </div>

                <Features />
                <Footer />
            </div>
        </div>
    );
}
