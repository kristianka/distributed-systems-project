const features = [
    {
        icon: "🎥",
        title: "Synchronized Playback",
        description: "Watch YouTube videos in perfect sync with friends"
    },
    {
        icon: "💬",
        title: "Real-time Chat",
        description: "Chat instantly while watching together"
    },
    {
        icon: "📝",
        title: "Shared Playlist",
        description: "Build and manage playlists collaboratively"
    },
    {
        icon: "👥",
        title: "Live Presence",
        description: "See who's watching in real-time"
    },
    {
        icon: "⚡",
        title: "Fault-tolerant",
        description: "Distributed backend with Raft consensus"
    },
    {
        icon: "🔒",
        title: "Private Rooms",
        description: "Create unique rooms for your group"
    }
];

export const Features = () => {
    return (
        <div className="bg-linear-to-b from-zinc-900 to-zinc-900/50 border border-zinc-800 rounded-2xl p-8">
            <h3 className="text-xl font-bold text-white mb-6 text-center">Features</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {features.map((feature, index) => (
                    <div
                        key={index}
                        className="group relative bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-700/50 hover:border-zinc-600 rounded-xl p-4 transition-all duration-200 hover:scale-[1.02] hover:shadow-lg hover:shadow-black/20"
                    >
                        <div className="text-2xl mb-2 group-hover:scale-110 transition-transform duration-200">
                            {feature.icon}
                        </div>
                        <h4 className="text-sm font-semibold text-white mb-1">{feature.title}</h4>
                        <p className="text-xs text-zinc-400 leading-relaxed">
                            {feature.description}
                        </p>
                    </div>
                ))}
            </div>
        </div>
    );
};
