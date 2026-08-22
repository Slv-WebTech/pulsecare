export function Skeleton({ width, height = 14, radius, className = "", style = {} }) {
  return (
    <span
      className={`skeleton ${className}`.trim()}
      style={{ display: "block", width: width ?? "100%", height, borderRadius: radius, ...style }}
    />
  );
}

export function SkeletonCard({ lines = 3 }) {
  return (
    <div className="card card-padded" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <Skeleton width={44} height={44} radius={999} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
          <Skeleton width="60%" height={14} />
          <Skeleton width="40%" height={12} />
        </div>
      </div>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} height={12} width={i === lines - 1 ? "70%" : "100%"} />
      ))}
    </div>
  );
}

export function SkeletonStatCard() {
  return (
    <div className="card stat-card">
      <div className="stat-card-top">
        <Skeleton width={34} height={34} radius={12} />
      </div>
      <Skeleton width={70} height={28} />
      <Skeleton width={90} height={12} />
    </div>
  );
}
