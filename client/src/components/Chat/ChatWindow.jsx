import { useEffect, useRef, useState } from "react";
import { api } from "../../services/api.js";
import { getSocket } from "../../services/socket.js";
import { useAuth } from "../../context/AuthContext.jsx";
import { Avatar } from "../ui/Avatar.jsx";
import { EmptyState } from "../ui/EmptyState.jsx";
import { MessageIcon, SendIcon } from "../ui/icons.jsx";

export default function ChatWindow({ peerId, peerName, hideHeader = false }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const bottomRef = useRef(null);

  useEffect(() => {
    api.get(`/chat/${peerId}`).then(({ data }) => setMessages(data.messages));

    const socket = getSocket();
    if (!socket) return;

    function handleNew(message) {
      if (message.sender_id === peerId || message.recipient_id === peerId) {
        setMessages((prev) => [...prev, message]);
      }
    }

    socket.on("message:new", handleNew);
    return () => socket.off("message:new", handleNew);
  }, [peerId]);

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
        {messages.length === 0 ? (
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
                  <p>{m.body}</p>
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
