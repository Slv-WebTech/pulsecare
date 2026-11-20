// "Dr Dana Doc" / "Dr. Dana Doc" -> "Dr. Dana Doc"; "Ravi Kumar" -> "Dr. Ravi Kumar".
export function doctorSalutation(name = "") {
  const rest = name.trim().replace(/^dr\.?\s+/i, "");
  return rest ? `Dr. ${rest}` : "Doctor";
}

export function firstName(name = "") {
  return name.trim().split(/\s+/)[0] || "there";
}

// Maps the assistant's structured filters onto the doctor-search query params
// (drops anything the search API doesn't support, e.g. availableDay, and non-finite numbers).
export function assistantFiltersToParams(filters = {}) {
  const out = {};
  if (typeof filters.specialization === "string" && filters.specialization) out.specialization = filters.specialization;
  if (typeof filters.location === "string" && filters.location) out.location = filters.location;
  if (typeof filters.language === "string" && filters.language) out.language = filters.language;
  if (Number.isFinite(Number(filters.maxFee)) && filters.maxFee !== null && filters.maxFee !== "") out.maxFee = Number(filters.maxFee);
  if (Number.isFinite(Number(filters.minExperience)) && filters.minExperience !== null && filters.minExperience !== "") out.minExperience = Number(filters.minExperience);
  return out;
}
