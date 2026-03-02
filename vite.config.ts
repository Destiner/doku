import { defineConfig, createLogger } from "vite";
import react from "@vitejs/plugin-react";

const logger = createLogger();
const originalError = logger.error.bind(logger);
logger.error = (msg, options) => {
  if (typeof msg === "string" && msg.includes("http proxy error")) return;
  originalError(msg, options);
};

export default defineConfig({
  customLogger: logger,
  plugins: [react()],
  server: {
    port: 51738,
    proxy: {
      "/api": {
        target: `http://localhost:${process.env.DOKU_PORT || 39483}`,
        configure: (proxy) => {
          proxy.on("error", () => {});
        },
      },
    },
  },
  build: {
    outDir: "dist",
  },
});
