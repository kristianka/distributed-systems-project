import { PlaylistVideo } from "../types";

interface PlaylistProps {
    videos: PlaylistVideo[];
    currentVideoId: string | null;
    onPlayVideo: (videoId: string) => void;
    onRemoveVideo: (videoId: string, position: number) => void;
}

export function Playlist({ videos, currentVideoId, onPlayVideo, onRemoveVideo }: PlaylistProps) {
    const getDisplayName = (userId: string) => {
        return userId.slice(-4);
    };

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex justify-between items-center px-4 py-3 border-b border-zinc-800">
                <h3 className="font-semibold text-white">📝 Playlist</h3>
                <span className="text-xs text-zinc-500">{videos.length} videos</span>
            </div>

            {/* Items */}
            <div className="flex-1 overflow-y-auto p-2">
                {videos.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full p-4 text-center text-zinc-500">
                        <p>Playlist is empty</p>
                        <p className="text-sm text-zinc-600">
                            Add videos using the input below the player
                        </p>
                    </div>
                ) : (
                    videos.map((video, index) => (
                        <div
                            key={`${video.videoId}-${index}`}
                            className={`flex items-center gap-2 p-2 rounded-lg transition-colors hover:bg-zinc-800 ${
                                video.videoId === currentVideoId
                                    ? "bg-blue-600/20 border border-blue-500"
                                    : ""
                            }`}
                        >
                            {/* Thumbnail */}
                            <div
                                className="relative w-16 h-12 rounded overflow-hidden cursor-pointer flex-shrink-0 hover:opacity-90"
                                onClick={() => onPlayVideo(video.videoId)}
                            >
                                <img
                                    src={`https://img.youtube.com/vi/${video.videoId}/default.jpg`}
                                    alt="Video thumbnail"
                                    className="w-full h-full object-cover"
                                />
                                {video.videoId === currentVideoId && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white text-lg">
                                        ▶
                                    </div>
                                )}
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                                <span
                                    className="text-sm text-white truncate block"
                                    title={video.title || video.videoId}
                                >
                                    {video.title || video.videoId}
                                </span>
                                <span className="text-xs text-zinc-500">
                                    Added by {getDisplayName(video.addedBy)}
                                </span>
                            </div>

                            {/* Remove Button */}
                            <button
                                className="text-zinc-500 hover:text-red-400 hover:bg-red-400/10 text-xl p-1 rounded transition-colors"
                                onClick={() => onRemoveVideo(video.videoId, index)}
                                title="Remove from playlist"
                            >
                                ×
                            </button>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
