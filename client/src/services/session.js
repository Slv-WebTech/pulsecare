// In-memory access token + single-flight refresh. The access token is deliberately NOT persisted
// (no localStorage): it is short-lived, and a page reload restores the session from the httpOnly
// refresh cookie, so script injected into the page cannot read a long-lived credential.

let accessToken = null;
let refreshPromise = null;

export function getAccessToken() {
  return accessToken;
}

export function setAccessToken(token) {
  accessToken = token || null;
}

// One refresh at a time: concurrent 401s share the same request (refresh tokens rotate, so a
// second parallel refresh would be treated as token reuse and revoke the session).
export function refreshSession(client) {
  if (!refreshPromise) {
    const attempt = () => client.post("/auth/refresh", null, { _skipAuthRefresh: true });
    refreshPromise = attempt()
      // Another tab/request rotated the cookie a moment ago (409): the browser now holds the new
      // cookie, so one retry after a short pause picks it up.
      .catch(async (err) => {
        if (err.response?.status !== 409) throw err;
        await new Promise((resolve) => setTimeout(resolve, 300));
        return attempt();
      })
      .then(({ data }) => {
        setAccessToken(data.token);
        return data;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

export const SESSION_EXPIRED_EVENT = "auth:expired";
