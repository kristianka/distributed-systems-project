import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useState, useEffect } from "react";
import { HomePage } from "./pages/HomePage";
import { RoomPage } from "./pages/RoomPage";
import { NodeStatusTooltip } from "./components";
import { NodeStatusProvider, useNodeStatus } from "./context";

// Generate a unique user ID or retrieve from localStorage
function getUserId(): string {
    const stored = localStorage.getItem("userId");
    if (stored) return stored;

    const newId = `user-${Math.random().toString(36).substring(2, 9)}`;
    localStorage.setItem("userId", newId);
    return newId;
}

function AppContent() {
    const [userId] = useState(getUserId);

    const { connectedNodeName, connectedUrl, connectionFailed, retry } = useNodeStatus();

    useEffect(() => {
        console.log("[App] User ID:", userId);
        if (connectedNodeName) {
            console.log("[App] Connected to:", connectedNodeName);
        }
    }, [userId, connectedNodeName]);

    return (
        <div className="flex flex-col h-screen bg-zinc-950 text-white">
            <header className="flex justify-between items-center px-6 py-4 bg-zinc-900 border-b border-zinc-800">
                <h1 className="text-2xl font-bold">🎬 Watch Together</h1>
                <div className="flex items-center gap-4">
                    <NodeStatusTooltip />
                    {connectedNodeName ? (
                        <span className="text-sm text-emerald-400 bg-emerald-400/10 px-3 py-1.5 rounded-full">
                            ● {connectedNodeName}
                        </span>
                    ) : (
                        <span className="text-sm text-red-400 bg-red-400/10 px-3 py-1.5 rounded-full">
                            ● Disconnected
                        </span>
                    )}
                    <span className="text-sm text-zinc-400 bg-zinc-800 px-3 py-1.5 rounded-full font-mono">
                        {userId}
                    </span>
                </div>
            </header>
            <main className="flex-1 overflow-auto p-4">
                <Routes>
                    <Route
                        path="/"
                        element={
                            <HomePage
                                userId={userId}
                                nodeUrl={connectedUrl || ""}
                                connectionFailed={connectionFailed}
                                onRetry={retry}
                            />
                        }
                    />
                    <Route
                        path="/room/:roomCode"
                        element={<RoomPage userId={userId} nodeUrl={connectedUrl || ""} />}
                    />
                </Routes>
            </main>
        </div>
    );
}

function App() {
    return (
        <BrowserRouter>
            <NodeStatusProvider>
                <AppContent />
            </NodeStatusProvider>
        </BrowserRouter>
    );
}

export default App;
