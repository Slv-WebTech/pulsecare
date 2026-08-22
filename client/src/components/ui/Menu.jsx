import { useEffect, useRef, useState } from "react";

export function Menu({ trigger, children, align = "right" }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;

    function handlePointer(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    function handleKey(e) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <div className="menu" ref={rootRef}>
      {trigger(() => setOpen((v) => !v), open)}
      {open && (
        <div className="menu-panel" style={{ [align]: 0 }} role="menu" onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
}

export function MenuItem({ icon: IconCmp, danger = false, children, ...rest }) {
  return (
    <button type="button" role="menuitem" className={`menu-item ${danger ? "menu-item-danger" : ""}`} {...rest}>
      {IconCmp && <IconCmp />}
      {children}
    </button>
  );
}
