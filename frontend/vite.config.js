import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// During `npm run dev`, any request to /api is forwarded to the backend, so no CORS fuss.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { "/api": "http://localhost:4000" } },
});
