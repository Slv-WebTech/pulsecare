import { forwardRef } from "react";
import { Spinner } from "./Spinner.jsx";

const Button = forwardRef(function Button(
  { variant = "primary", size = "md", icon = false, loading = false, className = "", children, disabled, ...rest },
  ref
) {
  const classes = [
    "btn",
    `btn-${variant}`,
    size === "sm" ? "btn-sm" : size === "lg" ? "btn-lg" : "",
    icon ? "btn-icon" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button ref={ref} className={classes} disabled={disabled || loading} {...rest}>
      {loading ? <Spinner /> : children}
    </button>
  );
});

export default Button;
