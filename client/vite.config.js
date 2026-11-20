import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// Production builds get a strict Content-Security-Policy <meta> tag: scripts and styles only from
// our own origin (no inline script, no eval), API/WebSocket only to the configured backend, no framing.
// (Not applied in dev: Vite's HMR needs inline scripts. For real deployments also send the same
// policy as an HTTP header from your static host.)
function cspPlugin(env) {
  const origin = (u, fallback) => {
    try {
      return new URL(u || fallback).origin;
    } catch {
      return new URL(fallback).origin;
    }
  };
  const api = origin(env.VITE_API_URL, "http://localhost:5000");
  const ws = origin(env.VITE_SOCKET_URL, "http://localhost:5000");
  const wsOrigin = ws.replace(/^http/, "ws");
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' https://fonts.googleapis.com 'unsafe-inline'",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: https://res.cloudinary.com",
    `connect-src 'self' ${api} ${ws} ${wsOrigin}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
  return {
    name: "inject-csp",
    apply: "build",
    transformIndexHtml(html) {
      return html.replace("<head>", `<head>\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react(), cspPlugin(env)],
    server: {
      port: 5173,
    },
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: ["./src/test/setup.js"],
      css: false,
    },
  };
});
