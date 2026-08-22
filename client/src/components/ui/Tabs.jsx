import { useRef } from "react";

/**
 * Accessible tab list. `tabs` is [{ key, label, count }]; `active`/`onChange`
 * are controlled from the parent so the panel content can live outside.
 */
export function Tabs({ tabs, active, onChange }) {
  const refs = useRef({});

  function handleKeyDown(e, index) {
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    let nextIndex = index;
    if (e.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
    if (e.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
    if (e.key === "Home") nextIndex = 0;
    if (e.key === "End") nextIndex = tabs.length - 1;
    const nextTab = tabs[nextIndex];
    onChange(nextTab.key);
    refs.current[nextTab.key]?.focus();
  }

  return (
    <div className="tabs" role="tablist" aria-label="Sections">
      {tabs.map((tab, index) => (
        <button
          key={tab.key}
          ref={(el) => (refs.current[tab.key] = el)}
          role="tab"
          type="button"
          id={`tab-${tab.key}`}
          aria-selected={active === tab.key}
          aria-controls={`panel-${tab.key}`}
          tabIndex={active === tab.key ? 0 : -1}
          className="tab"
          onClick={() => onChange(tab.key)}
          onKeyDown={(e) => handleKeyDown(e, index)}
        >
          {tab.label}
          {typeof tab.count === "number" && <span className="tab-count">{tab.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function TabPanel({ tabKey, active, children }) {
  if (tabKey !== active) return null;
  return (
    <div role="tabpanel" id={`panel-${tabKey}`} aria-labelledby={`tab-${tabKey}`} tabIndex={0}>
      {children}
    </div>
  );
}
