import { io } from "socket.io-client";
import { api } from "./api.js";
import { getAccessToken, refreshSession } from "./session.js";

let socket = null;
const handlers = new Map(); // event -> Set<fn>, re-attached whenever a new socket is created

function attach(sock, event, fn) {
  sock.on(event, fn);
}

export function connectSocket() {
  socket?.disconnect();
  socket = io(import.meta.env.VITE_SOCKET_URL || "http://localhost:5000", {
    // A function, so every (re)connect handshake uses the *current* access token.
    auth: (cb) => cb({ token: getAccessToken() }),
    autoConnect: true,
  });

  // The server drops the connection when the access token expires (and rejects expired ones):
  // refresh the session, then let socket.io reconnect with the new token.
  socket.on("connect_error", async (err) => {
    if (err.message === "Unauthorized") {
      try {
        await refreshSession(api);
        socket.connect();
      } catch {
        /* session is gone; the 401 interceptor already signalled it */
      }
    }
  });
  socket.on("disconnect", async (reason) => {
    if (reason === "io server disconnect") {
      try {
        await refreshSession(api);
        socket.connect();
      } catch {
        /* see above */
      }
    }
  });

  for (const [event, fns] of handlers) for (const fn of fns) attach(socket, event, fn);
  return socket;
}

export function getSocket() {
  return socket;
}

// Subscribe to a socket event for the lifetime of the app, across reconnects/new sockets.
export function onSocketEvent(event, fn) {
  if (!handlers.has(event)) handlers.set(event, new Set());
  handlers.get(event).add(fn);
  if (socket) attach(socket, event, fn);
  return () => {
    handlers.get(event)?.delete(fn);
    socket?.off(event, fn);
  };
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
