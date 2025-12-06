import { Participant } from "../types";

interface ParticipantsProps {
    participants: Participant[];
    currentUserId: string;
}

export function Participants({ participants, currentUserId }: ParticipantsProps) {
    const getDisplayName = (userId: string) => {
        return userId.slice(-4);
    };

    const formatJoinTime = (timestamp: number) => {
        return new Date(timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit"
        });
    };

    return (
        <div className="flex flex-col">
            {/* Header */}
            <div className="flex justify-between items-center px-4 py-3 border-b border-zinc-800">
                <h3 className="font-semibold text-white">👥 Participants</h3>
                <span className="text-xs text-emerald-400">{participants.length} online</span>
            </div>

            {/* List */}
            <div className="p-2 max-h-40 overflow-y-auto">
                {participants.length === 0 ? (
                    <div className="p-4 text-center text-zinc-500">
                        <p>No participants</p>
                    </div>
                ) : (
                    participants.map((participant) => (
                        <div
                            key={participant.userId}
                            className={`flex items-center gap-2 p-2 rounded-lg transition-colors hover:bg-zinc-800 ${
                                participant.userId === currentUserId ? "bg-blue-600/10" : ""
                            }`}
                        >
                            {/* Avatar */}
                            <div className="w-8 h-8 flex items-center justify-center bg-zinc-800 rounded-full text-lg">
                                {participant.isCreator ? "👑" : "👤"}
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                                <span className="text-sm text-white font-medium">
                                    {getDisplayName(participant.userId)}
                                    {participant.userId === currentUserId && (
                                        <span className="text-zinc-400"> (you)</span>
                                    )}
                                </span>
                                <span className="text-xs text-zinc-500 block">
                                    Joined at {formatJoinTime(participant.joinedAt)}
                                </span>
                            </div>

                            {/* Host Badge */}
                            {participant.isCreator && (
                                <span className="text-[10px] px-2 py-0.5 bg-yellow-500 text-black rounded font-semibold uppercase">
                                    Host
                                </span>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
