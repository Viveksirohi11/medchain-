import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import StatusBadge from "../components/StatusBadge.jsx";
import { drugTitle, fmtDateTime, shortAddr } from "../utils";

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [soon, setSoon] = useState([]);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  async function loadDashboard(isRefresh = false) {
    if (isRefresh) setRefreshing(true);
    setError("");

    try {
      const [s, a, e] = await Promise.all([
        api.get("/stats"),
        api.get("/alerts"),
        api.get("/batches", {
          expiringInDays: 60,
          sort: "expiry",
          limit: 5
        })
      ]);

      setStats(s);
      setAlerts(Array.isArray(a) ? a : []);
      setSoon(Array.isArray(e.items) ? e.items : []);
    } catch (err) {
      setError(err.message || "Unable to load dashboard data.");
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  const cards = stats ? [
    {
      label: "Registered batches",
      value: stats.batches,
      detail: "Total tracked batches",
      icon: "▦",
      tone: "navy",
      href: "/batches"
    },
    {
      label: "Active batches",
      value: stats.active,
      detail: "Currently active",
      icon: "✓",
      tone: "green",
      href: "/batches?status=active"
    },
    {
      label: "Recalled batches",
      value: stats.recalled,
      detail: "Require attention",
      icon: "!",
      tone: "red",
      href: "/batches?status=recalled"
    },
    {
      label: "Packs registered",
      value: stats.packsRegistered,
      detail: "Registered unit count",
      icon: "□",
      tone: "blue",
      href: "/batches"
    },
    {
      label: "Packs dispensed",
      value: stats.packsDispensed,
      detail: "Recorded dispensing events",
      icon: "↗",
      tone: "teal",
      href: "/batches"
    },
    {
      label: "Duplicate-scan alerts",
      value: stats.duplicateAlerts,
      detail: "Recorded alerts",
      icon: "!",
      tone: "amber",
      href: "/batches?flagged=true"
    }
  ] : [];

  return (
    <div className="dashboard-page">
      <section className="dashboard-header">
        <div className="dashboard-heading-copy">
          <p className="dashboard-eyebrow">MEDCHAIN / OPERATIONS</p>
          <h1>Supply chain overview</h1>
          <p>
            Monitor batch activity, review traceability alerts and keep
            important medicine records in view.
          </p>
        </div>

        <div className="dashboard-header-actions">
          <button
            type="button"
            className="dashboard-refresh"
            onClick={() => loadDashboard(true)}
            disabled={refreshing}
          >
            {refreshing ? "Refreshing..." : "↻ Refresh"}
          </button>
          <Link className="btn primary dashboard-primary-action" to="/new">
            + Register batch
          </Link>
        </div>
      </section>

      {error && (
        <section className="dashboard-error" role="alert">
          <div>
            <strong>Dashboard data could not be loaded</strong>
            <p>{error}</p>
            <span className="muted">
              Check that the backend is running and the demo environment is ready.
            </span>
          </div>
          <button type="button" onClick={() => loadDashboard(true)}>
            Try again
          </button>
        </section>
      )}

      {!stats && !error && (
        <section className="card dashboard-loading">
          <div className="dashboard-loading-mark">M</div>
          <div>
            <strong>Loading your operations</strong>
            <p className="muted">Retrieving batch and alert records...</p>
          </div>
        </section>
      )}

      {stats && (
        <>
          <section className="dashboard-section">
            <div className="dashboard-section-heading">
              <div>
                <h2>Operations at a glance</h2>
                <p className="muted">
                  Summary based on the connected MedChain records.
                </p>
              </div>
              <Link to="/batches" className="dashboard-text-link">
                View all batches →
              </Link>
            </div>

            <div className="dashboard-metrics">
              {cards.map((card) => (
                <Link
                  className="dashboard-metric"
                  key={card.label}
                  to={card.href}
                >
                  <div className="dashboard-metric-top">
                    <span className={`dashboard-metric-icon ${card.tone}`}>
                      {card.icon}
                    </span>
                    <span className="dashboard-metric-arrow">↗</span>
                  </div>
                  <div className="dashboard-metric-value">
                    {Number(card.value ?? 0).toLocaleString()}
                  </div>
                  <div className="dashboard-metric-label">{card.label}</div>
                  <div className="dashboard-metric-detail">{card.detail}</div>
                </Link>
              ))}
            </div>
          </section>

          <section className="dashboard-priority-grid">
            <article className="dashboard-panel">
              <div className="dashboard-panel-header">
                <div className="dashboard-panel-title">
                  <span className="dashboard-panel-symbol alert-symbol">!</span>
                  <div>
                    <h2>Duplicate-scan alerts</h2>
                    <p className="muted">Recorded verification warnings</p>
                  </div>
                </div>
                <span className={`dashboard-count ${alerts.length ? "is-warning" : ""}`}>
                  {alerts.length}
                </span>
              </div>

              {alerts.length === 0 ? (
                <div className="dashboard-empty">
                  <span className="dashboard-empty-icon">✓</span>
                  <strong>No duplicate-scan alerts recorded</strong>
                  <p>
                    No alerts were returned by the connected backend.
                    This is not a guarantee that every medicine is genuine.
                  </p>
                </div>
              ) : (
                <div className="dashboard-record-list">
                  {alerts.slice(0, 5).map((alert, index) => (
                    <div className="dashboard-record" key={alert.tx || `${alert.batchId}-${index}`}>
                      <div className="dashboard-record-icon alert-record-icon">!</div>
                      <div className="dashboard-record-body">
                        <Link to={`/batches/${alert.batchId}`}>
                          Batch #{alert.batchId}
                        </Link>
                        <p>
                          Duplicate scan reported at {shortAddr(alert.scanner)}
                        </p>
                        <span className="dashboard-record-time">
                          {fmtDateTime(alert.at)}
                        </span>
                      </div>
                      <Link
                        className="dashboard-record-open"
                        to={`/batches/${alert.batchId}/investigation`}
                        aria-label={`Review investigation for batch ${alert.batchId}`}
                        title="Review investigation"
                      >
                        →
                      </Link>
                    </div>
                  ))}
                </div>
              )}

              <div className="dashboard-panel-footer">
                <Link to="/batches?flagged=true">
                  Review flagged batches →
                </Link>
              </div>
            </article>

            <article className="dashboard-panel">
              <div className="dashboard-panel-header">
                <div className="dashboard-panel-title">
                  <span className="dashboard-panel-symbol expiry-symbol">◷</span>
                  <div>
                    <h2>Expiry watch</h2>
                    <p className="muted">Batches expiring within 60 days</p>
                  </div>
                </div>
                <span className="dashboard-count">{soon.length}</span>
              </div>

              {soon.length === 0 ? (
                <div className="dashboard-empty">
                  <span className="dashboard-empty-icon">◷</span>
                  <strong>No upcoming expiries returned</strong>
                  <p>
                    No matching batches were returned for this date window.
                  </p>
                </div>
              ) : (
                <div className="dashboard-record-list">
                  {soon.map((batch) => (
                    <div className="dashboard-record" key={batch.id}>
                      <div className="dashboard-record-icon expiry-record-icon">◷</div>
                      <div className="dashboard-record-body">
                        <Link to={`/batches/${batch.id}`}>
                          {drugTitle(batch)}
                        </Link>
                        <p>Batch #{batch.id}</p>
                        <span className="dashboard-record-time">
                          {batch.daysToExpiry} days until expiry
                        </span>
                      </div>
                      <StatusBadge status={batch.status} />
                    </div>
                  ))}
                </div>
              )}

              <div className="dashboard-panel-footer">
                <Link to="/batches?sort=expiry">
                  Review batch records →
                </Link>
              </div>
            </article>
          </section>

          <section className="dashboard-workspace">
            <div className="dashboard-workspace-copy">
              <p className="dashboard-eyebrow">TRACEABILITY WORKSPACE</p>
              <h2>Investigate before you conclude.</h2>
              <p>
                Review recorded custody history, investigate duplicate-scan
                warnings and compare on-chain records with available evidence.
              </p>
              <p className="dashboard-workspace-note">
                A recorded transfer does not independently prove physical
                delivery or medicine quality.
              </p>
            </div>

            <div className="dashboard-quick-actions">
              <Link to="/verify" className="dashboard-quick-action">
                <span className="quick-action-icon">⌕</span>
                <span>
                  <strong>Verify a pack</strong>
                  <small>Check a serial or QR code</small>
                </span>
                <span className="quick-action-arrow">→</span>
              </Link>

              <Link to="/batches" className="dashboard-quick-action">
                <span className="quick-action-icon">▤</span>
                <span>
                  <strong>Search batches</strong>
                  <small>Review recorded batch details</small>
                </span>
                <span className="quick-action-arrow">→</span>
              </Link>

              <Link to="/new" className="dashboard-quick-action">
                <span className="quick-action-icon">＋</span>
                <span>
                  <strong>Register a batch</strong>
                  <small>Create a new batch record</small>
                </span>
                <span className="quick-action-arrow">→</span>
              </Link>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
