import { createContext, useContext, useEffect, useState } from "react";
import { api } from "../services/api.js";
import { connectSocket, disconnectSocket } from "../services/socket.js";
import { setAccessToken, refreshSession, SESSION_EXPIRED_EVENT } from "../services/session.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Restore the session from the httpOnly refresh cookie (the access token is memory-only).
  useEffect(() => {
    let cancelled = false;
    refreshSession(api)
      .then(({ user: restored }) => {
        if (cancelled) return;
        setUser(restored);
        connectSocket();
      })
      .catch(() => {
        /* no (valid) session: stay logged out */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // A refresh that fails mid-session (revoked/expired) logs the user out cleanly.
  useEffect(() => {
    function onExpired() {
      disconnectSocket();
      setUser(null);
    }
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);

  async function login(email, password) {
    const { data } = await api.post("/auth/login", { email, password });
    setAccessToken(data.token);
    setUser(data.user);
    connectSocket();
    return data.user;
  }

  async function register(payload) {
    const { data } = await api.post("/auth/register", payload);
    setAccessToken(data.token);
    setUser(data.user);
    connectSocket();
    return data.user;
  }

  async function logout() {
    try {
      await api.post("/auth/logout"); // revokes the refresh token server-side and clears the cookie
    } catch {
      /* offline / already expired: still clear local state */
    }
    setAccessToken(null);
    disconnectSocket();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
