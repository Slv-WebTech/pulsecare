import { Card } from "./Card.jsx";

export function StatCard({ icon: IconCmp, label, value }) {
  return (
    <Card className="stat-card">
      <div className="stat-card-top">
        <span className="stat-card-icon">
          <IconCmp />
        </span>
      </div>
      <span className="stat-card-value">{value}</span>
      <span className="stat-card-label">{label}</span>
    </Card>
  );
}
