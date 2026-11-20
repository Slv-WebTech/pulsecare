import { api } from "./api.js";

// Documents are private: the server only hands out a signed, access-checked URL on request
// (and records the access in the audit log), so the raw storage URL is never shown or linked.
export async function openDocument(id) {
  const { data } = await api.get(`/documents/${id}/file`);
  window.open(data.url, "_blank", "noopener,noreferrer");
}
