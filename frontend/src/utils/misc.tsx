// Generate a unique user ID or retrieve from localStorage
export const getUserId = () => {
    const stored = localStorage.getItem("userId");
    if (stored) return stored;

    const newId = `user-${Math.random().toString(36).substring(2, 9)}`;
    localStorage.setItem("userId", newId);
    return newId;
};

// Get username from localStorage or generate a default one
export const getUsername = () => {
    const stored = localStorage.getItem("username");
    if (stored) return stored;

    const defaultUsername = `User${Math.floor(1000 + Math.random() * 9000)}`;
    localStorage.setItem("username", defaultUsername);
    return defaultUsername;
};

// Save username to localStorage
export const setUsername = (username: string) => {
    localStorage.setItem("username", username);
};
