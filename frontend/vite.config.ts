import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// https://vite.dev/config/
export default defineConfig({
    plugins: [react(), tailwindcss()],
    resolve: {
        alias: {
            "@shared": path.resolve(__dirname, "../shared")
        }
    },
    server: {
        port: 5173,
        proxy: {
            "/ws": {
                target: "ws://localhost:3001",
                ws: true,
                rewriteWsOrigin: true
            }
        }
    }
});
