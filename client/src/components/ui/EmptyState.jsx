export function EmptyState({ icon: IconCmp, title, description, action, className = "" }) {
  return (
    <div className={`empty-state ${className}`.trim()}>
      {IconCmp && (
        <span className="empty-state-icon">
          <IconCmp />
        </span>
      )}
      <div>
        <p className="empty-state-title">{title}</p>
        {description && <p className="empty-state-desc">{description}</p>}
      </div>
      {action}
    </div>
  );
}
