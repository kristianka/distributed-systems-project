import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useState, useEffect } from "react";
import { HomePage } from "./pages/HomePage";
import { RoomPage } from "./pages/RoomPage";
import { useAutoConnect } from "./hooks";
import { getBackendNodes } from "./config";

// Generate a unique user ID or retrieve from localStorage
function getUserId(): string {
    const stored = localStorage.getItem("userId");
    if (stored) return stored;

    const newId = `user-${Math.random().toString(36).substring(2, 9)}`;
    localStorage.setItem("userId", newId);
    return newId;
}

function App() {
    const [userId] = useState(getUserId);
    const nodes = getBackendNodes();

    const {
        connectedNodeIndex,
        connectedNodeName,
        connectedUrl,
        isConnecting,
        connectionFailed,
        retry
    } = useAutoConnect();

    useEffect(() => {
        console.log("[App] User ID:", userId);
        if (connectedNodeName) {
            console.log("[App] Connected to:", connectedNodeName);
        }
    }, [userId, connectedNodeName]);

    // Show connecting state
    if (isConnecting) {
        return (
            <div className="flex flex-col h-screen bg-zinc-950 text-white items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                    <h2 className="text-xl font-semibold mb-2">Connecting to server...</h2>
                    <p className="text-zinc-400">Trying {nodes.length} available nodes</p>
                </div>
            </div>
        );
    }

    // Show error state
    if (connectionFailed || connectedNodeIndex === null) {
        return (
            <div className="flex flex-col h-screen bg-zinc-950 text-white items-center justify-center">
                <div className="text-center">
                    <div className="text-red-500 text-5xl mb-4">⚠️</div>
                    <h2 className="text-xl font-semibold mb-2">Connection Failed</h2>
                    <p className="text-zinc-400 mb-4">Could not connect to any server</p>
                    <button
                        onClick={retry}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded-lg transition-colors"
                    >
                        Retry Connection
                    </button>
                </div>
            </div>
        );
    }

    return (
        <BrowserRouter>
            <div className="flex flex-col h-screen bg-zinc-950 text-white">
                <header className="flex justify-between items-center px-6 py-4 bg-zinc-900 border-b border-zinc-800">
                    <h1 className="text-2xl font-bold">🎬 Watch Together</h1>
                    <div className="flex items-center gap-4">
                        <span className="text-sm text-emerald-400 bg-emerald-400/10 px-3 py-1.5 rounded-full">
                            ● {connectedNodeName}
                        </span>
                        <span className="text-sm text-zinc-400 bg-zinc-800 px-3 py-1.5 rounded-full font-mono">
                            {userId}
                        </span>
                    </div>
                </header>
                <main className="flex-1 overflow-auto p-4">
                    <Routes>
                        <Route
                            path="/"
                            element={<HomePage userId={userId} nodeUrl={connectedUrl!} />}
                        />
                        <Route
                            path="/room/:roomCode"
                            element={<RoomPage userId={userId} nodeUrl={connectedUrl!} />}
                        />
                    </Routes>
                </main>
            </div>
        </BrowserRouter>
    );
}

export default App;
