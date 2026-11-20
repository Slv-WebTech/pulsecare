import { useEffect, useRef, useState } from "react";
import { api } from "../../services/api.js";
import { getSocket } from "../../services/socket.js";
import { useAuth } from "../../context/AuthContext.jsx";
import { Avatar } from "../ui/Avatar.jsx";
import { EmptyState } from "../ui/EmptyState.jsx";
import { Alert } from "../ui/Alert.jsx";
import { Spinner } from "../ui/Spinner.jsx";
import { useToast } from "../ui/ToastContext.jsx";
import { MessageIcon, SendIcon } from "../ui/icons.jsx";

export default function ChatWindow({ peerId, peerName, hideHeader = false }) {
  const { user } = useAuth();
  const toast = useToast();
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const bottomRef = useRef(null);

  useEffect(() => {
    setLoading(true);
    setError("");
    api
      .get(`/chat/${peerId}`)
      .then(({ data }) => setMessages(data.messages))
      .catch(() => setError("Couldn't load this conversation."))
      .finally(() => setLoading(false));

    const socket = getSocket();
    if (!socket) return;

    function handleNew(message) {
      if (message.sender_id === peerId || message.recipient_id === peerId) {
        setMessages((prev) => [...prev, message]);
      }
    }

    function handleError({ error: message } = {}) {
      toast.error(message || "Failed to send message");
    }

    socket.on("message:new", handleNew);
    socket.on("message:error", handleError);
    return () => {
      socket.off("message:new", handleNew);
      socket.off("message:error", handleError);
    };
  }, [peerId, toast]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleSend(e) {
    e.preventDefault();
    if (!draft.trim()) return;

    const socket = getSocket();
    socket?.emit("message:send", { recipientId: peerId, body: draft });
    setDraft("");
  }

  return (
    <div className="chat-window">
      {!hideHeader && (
        <div className="chat-window-header">
          <Avatar name={peerName} size="sm" />
          <h3 className="section-title" style={{ fontSize: "var(--text-base)" }}>
            {peerName}
          </h3>
        </div>
      )}
      <div className="chat-window-messages">
        {loading ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Spinner />
          </div>
        ) : error ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Alert tone="danger">{error}</Alert>
          </div>
        ) : messages.length === 0 ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <EmptyState
              icon={MessageIcon}
              title="No messages yet"
              description={`Say hello to ${peerName} to start the conversation.`}
            />
          </div>
        ) : (
          messages.map((m) => {
            const isOwn = m.sender_id === user?.id;
            return (
              <div key={m.id} className={`chat-bubble-row ${isOwn ? "is-own" : ""}`}>
                <div className="chat-bubble">
                  {m.body && <p>{m.body}</p>}
                  {m.file_url && (
                    <p>
                      <a href={m.file_url} target="_blank" rel="noopener noreferrer">
                        Attachment
                      </a>
                    </p>
                  )}
                  <span className="chat-bubble-time">
                    {new Date(m.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                  </span>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={handleSend} className="chat-window-composer">
        <input
          className="input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type a message…"
          aria-label="Message"
        />
        <button type="submit" className="btn btn-primary btn-icon" aria-label="Send message" disabled={!draft.trim()}>
          <SendIcon />
        </button>
      </form>
    </div>
  );
}
