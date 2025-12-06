import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useState, useEffect } from "react";
import { HomePage } from "./pages/HomePage";
import { RoomPage } from "./pages/RoomPage";

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

    useEffect(() => {
        console.log("[App] User ID:", userId);
    }, [userId]);

    return (
        <BrowserRouter>
            <div className="flex flex-col h-screen bg-zinc-950 text-white">
                <header className="flex justify-between items-center px-6 py-4 bg-zinc-900 border-b border-zinc-800">
                    <h1 className="text-2xl font-bold">🎬 Watch Together</h1>
                    <span className="text-sm text-zinc-400 bg-zinc-800 px-3 py-1.5 rounded-full font-mono">
                        User: {userId}
                    </span>
                </header>
                <main className="flex-1 overflow-auto p-4">
                    <Routes>
                        <Route path="/" element={<HomePage userId={userId} />} />
                        <Route path="/room/:roomCode" element={<RoomPage userId={userId} />} />
                    </Routes>
                </main>
            </div>
        </BrowserRouter>
    );
}

export default App;
