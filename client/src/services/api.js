import axios from "axios";
import { getAccessToken, setAccessToken, refreshSession, SESSION_EXPIRED_EVENT } from "./session.js";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:5000/api",
  withCredentials: true, // sends the httpOnly refresh cookie to /auth/*
});

api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

const AUTH_PATHS = ["/auth/login", "/auth/register", "/auth/refresh", "/auth/logout"];

// On a 401 for a normal request, refresh the session once and replay the request.
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { config, response } = error;
    const isAuthCall = AUTH_PATHS.some((p) => config?.url?.endsWith(p));
    if (response?.status !== 401 || !config || config._retry || config._skipAuthRefresh || isAuthCall) {
      return Promise.reject(error);
    }
    config._retry = true;
    try {
      await refreshSession(api);
    } catch {
      setAccessToken(null);
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
      return Promise.reject(error);
    }
    config.headers.Authorization = `Bearer ${getAccessToken()}`;
    return api(config);
  }
);
