import { useId } from "react";
import { AlertCircleIcon } from "./icons.jsx";

/**
 * Label + control + hint/error wrapper. Pass a render prop `children(id)` so
 * the control gets a stable id wired to the label via htmlFor.
 */
export function Field({ label, hint, error, optional = false, children, className = "" }) {
  const autoId = useId();

  return (
    <div className={`field ${error ? "field-invalid" : ""} ${className}`.trim()}>
      {label && (
        <label className="field-label" htmlFor={autoId}>
          {label} {optional && <span className="optional">(optional)</span>}
        </label>
      )}
      {typeof children === "function" ? children(autoId) : children}
      {error ? (
        <span className="field-error">
          <AlertCircleIcon />
          {error}
        </span>
      ) : hint ? (
        <span className="field-hint">{hint}</span>
      ) : null}
    </div>
  );
}
