import { useState } from "react";
import { api } from "../../services/api.js";
import { openDocument } from "../../services/documents.js";
import { Card } from "../ui/Card.jsx";
import Button from "../ui/Button.jsx";
import { useToast } from "../ui/ToastContext.jsx";
import { FileTextIcon, SparklesIcon, AlertTriangleIcon } from "../ui/icons.jsx";

export default function DocumentCard({ document, onSummarized }) {
  const [summarizing, setSummarizing] = useState(false);
  const toast = useToast();

  async function handleSummarize() {
    setSummarizing(true);
    try {
      const { data } = await api.post(`/documents/${document.id}/summarize`);
      onSummarized(data.document);
    } catch (err) {
      toast.error("Couldn't generate a summary — try again.");
    } finally {
      setSummarizing(false);
    }
  }

  return (
    <Card className="document-card">
      <div className="document-card-top">
        <span className="document-file-icon">
          <FileTextIcon />
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <button
            type="button"
            className="document-card-name link-button"
            onClick={() => openDocument(document.id).catch(() => toast.error("Couldn't open this document."))}
          >
            {document.original_name}
          </button>
          <p className="document-card-date">
            {new Date(document.uploaded_at).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        </div>
      </div>

      {document.ai_summary ? (
        <div className="document-summary">
          <div className="document-summary-head">
            <SparklesIcon size={13} />
            AI Summary
          </div>
          <p className="document-summary-type">{document.ai_summary.documentType}</p>
          <p className="document-summary-info">{document.ai_summary.keyInfo}</p>
          {document.ai_summary.abnormalValues && (
            <p className="document-summary-abnormal">
              <AlertTriangleIcon />
              {document.ai_summary.abnormalValues}
            </p>
          )}
          {document.ai_summary.truncated && (
            <p className="document-summary-followup" role="note">
              Only the first {document.ai_summary.pagesRead} of {document.ai_summary.totalPages} pages were summarized.
            </p>
          )}
          {document.ai_summary.followUp && (
            <p className="document-summary-followup">Follow-up: {document.ai_summary.followUp}</p>
          )}
          <p className="document-card-disclaimer">
            For informational purposes only — not a medical diagnosis.
          </p>
        </div>
      ) : (
        <Button variant="secondary" size="sm" onClick={handleSummarize} loading={summarizing}>
          <SparklesIcon size={15} /> Get AI summary
        </Button>
      )}
    </Card>
  );
}
