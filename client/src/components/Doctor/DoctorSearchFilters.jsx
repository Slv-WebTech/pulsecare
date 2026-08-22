import { useState } from "react";
import { Field } from "../ui/Field.jsx";
import Button from "../ui/Button.jsx";
import { SearchIcon, StethoscopeIcon, MapPinIcon, DollarIcon, ClockIcon, GlobeIcon, XIcon } from "../ui/icons.jsx";

const initialFilters = {
  specialization: "",
  location: "",
  maxFee: "",
  minExperience: "",
  language: "",
};

export default function DoctorSearchFilters({ onSearch }) {
  const [filters, setFilters] = useState(initialFilters);

  function handleChange(e) {
    setFilters((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    const cleaned = Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== ""));
    onSearch(cleaned);
  }

  function handleReset() {
    setFilters(initialFilters);
    onSearch({});
  }

  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <form className="filters-bar" onSubmit={handleSubmit}>
      <Field label="Specialization">
        {(id) => (
          <div className="input-shell">
            <StethoscopeIcon className="icon-leading" />
            <input
              id={id}
              className="input"
              name="specialization"
              placeholder="Cardiology"
              value={filters.specialization}
              onChange={handleChange}
            />
          </div>
        )}
      </Field>
      <Field label="Location">
        {(id) => (
          <div className="input-shell">
            <MapPinIcon className="icon-leading" />
            <input id={id} className="input" name="location" placeholder="City" value={filters.location} onChange={handleChange} />
          </div>
        )}
      </Field>
      <Field label="Max fee">
        {(id) => (
          <div className="input-shell">
            <DollarIcon className="icon-leading" />
            <input
              id={id}
              className="input"
              name="maxFee"
              type="number"
              min="0"
              placeholder="200"
              value={filters.maxFee}
              onChange={handleChange}
            />
          </div>
        )}
      </Field>
      <Field label="Min. experience">
        {(id) => (
          <div className="input-shell">
            <ClockIcon className="icon-leading" />
            <input
              id={id}
              className="input"
              name="minExperience"
              type="number"
              min="0"
              placeholder="5"
              value={filters.minExperience}
              onChange={handleChange}
            />
          </div>
        )}
      </Field>
      <Field label="Language">
        {(id) => (
          <div className="input-shell">
            <GlobeIcon className="icon-leading" />
            <input id={id} className="input" name="language" placeholder="Spanish" value={filters.language} onChange={handleChange} />
          </div>
        )}
      </Field>
      <div className="field-actions">
        {hasFilters && (
          <Button type="button" variant="ghost" onClick={handleReset}>
            <XIcon /> Clear
          </Button>
        )}
        <Button type="submit" variant="primary">
          <SearchIcon /> Search
        </Button>
      </div>
    </form>
  );
}
