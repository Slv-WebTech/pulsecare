import { AlertTriangleIcon, InfoIcon, AlertCircleIcon } from "./icons.jsx";

const ICONS = {
  danger: AlertCircleIcon,
  warning: AlertTriangleIcon,
  info: InfoIcon,
};

export function Alert({ tone = "info", children }) {
  const IconCmp = ICONS[tone] || InfoIcon;
  return (
    <div className={`alert alert-${tone}`} role={tone === "danger" ? "alert" : "status"}>
      <IconCmp />
      <span>{children}</span>
    </div>
  );
}
