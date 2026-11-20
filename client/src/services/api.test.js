import { describe, it, expect, beforeEach, vi } from "vitest";
import { api } from "./api.js";
import { getAccessToken, setAccessToken, SESSION_EXPIRED_EVENT } from "./session.js";

// A scriptable fake server behind axios' adapter.
function install(handler) {
  const calls = [];
  api.defaults.adapter = async (config) => {
    calls.push({ url: config.url, auth: config.headers.Authorization, method: config.method });
    const r = await handler(config, calls);
    if (r.status >= 400) {
      const err = new Error(`status ${r.status}`);
      err.config = config;
      err.response = { status: r.status, data: r.data, config };
      err.isAxiosError = true;
      throw err;
    }
    return { data: r.data, status: r.status, statusText: "OK", headers: {}, config };
  };
  return calls;
}

describe("api session handling", () => {
  beforeEach(() => setAccessToken(null));

  it("sends the in-memory access token as a bearer header and never touches localStorage", async () => {
    const calls = install(() => ({ status: 200, data: {} }));
    setAccessToken("abc");
    await api.get("/auth/me");
    expect(calls[0].auth).toBe("Bearer abc");
    expect(localStorage.getItem("token")).toBeNull();
  });

  it("on 401 refreshes once and replays the request with the new token", async () => {
    let validToken = "new";
    const calls = install((config) => {
      if (config.url === "/auth/refresh") return { status: 200, data: { token: "new", user: { id: 1 } } };
      return config.headers.Authorization === `Bearer ${validToken}` ? { status: 200, data: { ok: true } } : { status: 401, data: {} };
    });
    setAccessToken("expired");
    const res = await api.get("/appointments");
    expect(res.data).toEqual({ ok: true });
    expect(getAccessToken()).toBe("new");
    expect(calls.map((c) => c.url)).toEqual(["/appointments", "/auth/refresh", "/appointments"]);
  });

  it("concurrent 401s share a single refresh (refresh tokens rotate)", async () => {
    const calls = install((config) => {
      if (config.url === "/auth/refresh") return new Promise((r) => setTimeout(() => r({ status: 200, data: { token: "new" } }), 20));
      return config.headers.Authorization === "Bearer new" ? { status: 200, data: {} } : { status: 401, data: {} };
    });
    setAccessToken("expired");
    await Promise.all([api.get("/a"), api.get("/b"), api.get("/c")]);
    expect(calls.filter((c) => c.url === "/auth/refresh")).toHaveLength(1);
  });

  it("signals session expiry when the refresh itself fails", async () => {
    install((config) => ({ status: 401, data: {} }));
    const listener = vi.fn();
    window.addEventListener(SESSION_EXPIRED_EVENT, listener);
    setAccessToken("expired");
    await expect(api.get("/appointments")).rejects.toBeTruthy();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getAccessToken()).toBeNull();
    window.removeEventListener(SESSION_EXPIRED_EVENT, listener);
  });

  it("retries the refresh once when another tab just rotated the cookie (409)", async () => {
    let refreshCalls = 0;
    install((config) => {
      if (config.url === "/auth/refresh") {
        refreshCalls += 1;
        return refreshCalls === 1 ? { status: 409, data: { code: "rotated" } } : { status: 200, data: { token: "fresh" } };
      }
      return config.headers.Authorization === "Bearer fresh" ? { status: 200, data: {} } : { status: 401, data: {} };
    });
    setAccessToken("expired");
    await api.get("/appointments");
    expect(refreshCalls).toBe(2);
    expect(getAccessToken()).toBe("fresh");
  });

  it("does not try to refresh failed logins or an already-retried request", async () => {
    const calls = install(() => ({ status: 401, data: { error: "Invalid email or password" } }));
    await expect(api.post("/auth/login", {})).rejects.toBeTruthy();
    expect(calls).toHaveLength(1);
  });
});
