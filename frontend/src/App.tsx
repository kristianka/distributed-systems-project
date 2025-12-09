import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useState, useEffect } from "react";
import { HomePage } from "./pages/HomePage";
import { RoomPage } from "./pages/RoomPage";
import { NodeStatusProvider, useNodeStatus } from "./context";
import { getUserId, getUsername, setUsername as saveUsername } from "./utils";
import { Navigation } from "./components/Navigation";

function AppContent() {
    const [userId] = useState(getUserId);
    const [username, setUsernameState] = useState(getUsername);

    const setUsername = (newUsername: string) => {
        setUsernameState(newUsername);
        saveUsername(newUsername); // Persist to localStorage
    };

    const { connectedNodeName, connectedUrl, connectionFailed, retry } = useNodeStatus();

    useEffect(() => {
        console.log("[App] User ID:", userId);
        console.log("[App] Username:", username);
        if (connectedNodeName) {
            console.log("[App] Connected to:", connectedNodeName);
        }
    }, [userId, username, connectedNodeName]);

    return (
        <div className="flex flex-col h-screen bg-zinc-950 text-white">
            <Navigation username={username} setUsername={setUsername} />
            <main className="flex-1 overflow-auto p-5">
                <Routes>
                    <Route
                        path="/"
                        element={
                            <HomePage
                                userId={userId}
                                username={username}
                                nodeUrl={connectedUrl || ""}
                                connectionFailed={connectionFailed}
                                onRetry={retry}
                            />
                        }
                    />
                    <Route
                        path="/room/:roomCode"
                        element={
                            <RoomPage
                                userId={userId}
                                username={username}
                                nodeUrl={connectedUrl || ""}
                            />
                        }
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
