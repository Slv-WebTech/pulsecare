import { Link } from "react-router-dom";
import { PulseIcon, CalendarIcon, FileTextIcon, MessageIcon } from "../ui/icons.jsx";

const FEATURES = [
  { icon: CalendarIcon, title: "Book in minutes", desc: "Find the right specialist and grab a slot that works for you." },
  { icon: FileTextIcon, title: "Documents, summarized", desc: "Upload labs and reports; get a plain-language AI summary." },
  { icon: MessageIcon, title: "Message your care team", desc: "Ask follow-up questions without another phone call." },
];

function BrandMark() {
  return (
    <Link to="/" className="brand">
      <span className="brand-mark">
        <PulseIcon size={17} />
      </span>
      PulseCare
    </Link>
  );
}

export default function AuthLayout({ headline, subtitle, children }) {
  return (
    <div className="auth-shell">
      <div className="auth-visual">
        <div>
          <BrandMark />
          <div className="auth-visual-content">
            <p className="auth-visual-headline">{headline}</p>
            <p className="auth-visual-sub">{subtitle}</p>
            <div className="auth-feature-list">
              {FEATURES.map((f) => (
                <div className="auth-feature" key={f.title}>
                  <span className="auth-feature-icon">
                    <f.icon size={16} />
                  </span>
                  <div>
                    <p className="auth-feature-title">{f.title}</p>
                    <p className="auth-feature-desc">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <p className="auth-visual-footer">
          An AI layer assists with document summaries and appointment discovery — it does not replace your doctor.
        </p>
      </div>
      <div className="auth-panel">
        <div className="auth-form-wrap">
          <div className="auth-mobile-brand">
            <BrandMark />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
