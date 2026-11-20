import { useState } from "react";
import { api } from "../../services/api.js";
import { assistantFiltersToParams } from "../../utils.js";
import { Alert } from "../ui/Alert.jsx";
import Button from "../ui/Button.jsx";
import { SparklesIcon } from "../ui/icons.jsx";

// Natural-language doctor search: "heart doctor in Pune under 500" -> structured filters via the
// AI assistant. Optional — the normal filters keep working when the AI service is down.
export default function AssistantSearch({ onSearch }) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [applied, setApplied] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setLoading(true);
    setError("");
    try {
      const { data } = await api.post("/assistant/query", { message: text.trim() });
      const params = assistantFiltersToParams(data.filters);
      setApplied(params);
      onSearch(params);
    } catch (err) {
      setApplied(null);
      setError("The AI assistant is unavailable right now. Use the filters below instead.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="assistant-search" onSubmit={handleSubmit} aria-label="Ask the AI assistant">
      <label className="field-label" htmlFor="assistant-q">
        <SparklesIcon size={13} /> Describe the doctor you need
      </label>
      <div className="assistant-search-row">
        <input
          id="assistant-q"
          className="input"
          placeholder="e.g. a Hindi-speaking cardiologist in Pune under 500"
          value={text}
          maxLength={500}
          onChange={(e) => setText(e.target.value)}
        />
        <Button type="submit" variant="secondary" loading={loading} disabled={!text.trim()}>
          Ask assistant
        </Button>
      </div>
      {applied && (
        <p className="field-hint" role="status">
          Applied filters: {Object.entries(applied).map(([k, v]) => `${k}: ${v}`).join(", ") || "none understood"}
        </p>
      )}
      {error && <Alert tone="danger">{error}</Alert>}
    </form>
  );
}
