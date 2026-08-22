import { useEffect, useState } from "react";
import { api } from "../services/api.js";
import { PageHeader } from "../components/ui/PageHeader.jsx";
import { StatCard } from "../components/ui/StatCard.jsx";
import { SkeletonStatCard } from "../components/ui/Skeleton.jsx";
import { Card } from "../components/ui/Card.jsx";
import { EmptyState } from "../components/ui/EmptyState.jsx";
import { Alert } from "../components/ui/Alert.jsx";
import { UsersIcon, StethoscopeIcon, CalendarIcon, TrendingUpIcon, InboxIcon } from "../components/ui/icons.jsx";

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/admin/stats")
      .then(({ data }) => setStats(data))
      .catch(() => setError("Couldn't load platform stats. Try refreshing the page."));
  }, []);

  const specializations = stats?.popularSpecializations ?? [];
  const maxCount = specializations.length ? Math.max(...specializations.map((s) => s.count)) : 0;

  if (error) {
    return (
      <>
        <PageHeader eyebrow="Admin" title="Overview" subtitle="Platform activity at a glance." />
        <Alert tone="danger">{error}</Alert>
      </>
    );
  }

  return (
    <>
      <PageHeader eyebrow="Admin" title="Overview" subtitle="Platform activity at a glance." />

      <div className="stats-grid">
        {!stats ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonStatCard key={i} />)
        ) : (
          <>
            <StatCard icon={UsersIcon} label="Patients" value={stats.totalPatients} />
            <StatCard icon={StethoscopeIcon} label="Doctors" value={stats.totalDoctors} />
            <StatCard icon={CalendarIcon} label="Appointments" value={stats.totalAppointments} />
            <StatCard icon={TrendingUpIcon} label="Completion rate" value={`${stats.completionRate}%`} />
          </>
        )}
      </div>

      <div className="section" style={{ marginTop: "var(--space-10)" }}>
        <div className="section-head">
          <h2 className="section-title">Popular specializations</h2>
        </div>
        <Card>
          {!stats ? (
            <p className="text-meta">Loading…</p>
          ) : specializations.length === 0 ? (
            <EmptyState
              icon={InboxIcon}
              title="No data yet"
              description="Specialization trends will show up here once appointments come in."
            />
          ) : (
            <div className="rank-list">
              {specializations.map((s, i) => (
                <div className="rank-row" key={s.specialization}>
                  <span className="rank-index">{i + 1}</span>
                  <span className="rank-name">{s.specialization}</span>
                  <div className="rank-bar-track">
                    <div
                      className="rank-bar-fill"
                      style={{ width: `${maxCount ? (s.count / maxCount) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="rank-count tabular-nums">{s.count}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
