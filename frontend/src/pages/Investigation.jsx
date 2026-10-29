import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { useActor } from "../actor.jsx";
import { fmtDateTime, shortAddr, drugTitle } from "../utils";

export default function Investigation() {
  const { id } = useParams();
  const { actors, actor } = useActor();
  const [batch, setBatch] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    setLoading(true);
    setError("");

    api.get(`/batches/${id}`)
      .then((data) => {
        if (alive) setBatch(data);
      })
      .catch((err) => {
        if (alive) setError(err.message || "Unable to load batch.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [id]);

  if (loading) {
    return <section className="card"><p>Loading investigation...</p></section>;
  }

  if (error) {
    return (
      <section className="card">
        <h1>Investigation unavailable</h1>
        <p className="error">{error}</p>
        <Link to="/batches">Back to batches</Link>
      </section>
    );
  }

  if (!batch) return null;

  const history = Array.isArray(batch.history) ? batch.history : [];

  const nameOf = (address) => {
    if (!address) return "Unknown actor";

    return (
      actors.find(
        (item) =>
          item.address?.toLowerCase() === address.toLowerCase()
      )?.name || shortAddr(address)
    );
  };

  const custodyEvents = history.filter((event) => event.type === "custody");
  const latestCustody = custodyEvents[custodyEvents.length - 1];

  const currentCustodian = batch.custodian
    ? nameOf(batch.custodian)
    : "Not available";

  const isRegulator = actor?.role === "regulator";
  const isManufacturer =
    actor?.address?.toLowerCase() === batch.manufacturer?.toLowerCase();

  return (
    <div className="investigation-page">
      <p className="muted">
        <Link to="/batches">Batches</Link> / Batch {id} / Investigation
      </p>

      <section className="investigation-hero">
        <div className="investigation-heading">
          <div>
            <p className="eyebrow">TRACEABILITY INVESTIGATION</p>
            <h1>Handoff evidence review</h1>
            <p>
              Review recorded custody events and identify what the current
              records can—and cannot—establish.
            </p>
          </div>
          <span className="badge warn">Evidence review</span>
        </div>

        <div className="investigation-meta">
          <div>
            <span className="muted">Batch reference</span>
            <strong>#{String(id)}</strong>
          </div>
          <div>
            <span className="muted">Current batch status</span>
            <strong>{batch.status || "Unknown"}</strong>
          </div>
          <div>
            <span className="muted">Recorded custodian</span>
            <strong>{currentCustodian}</strong>
          </div>
        </div>
      </section>

      <section className="investigation-warning">
        <h2>What needs verification?</h2>
        <p>
          The current event model records custody transfers, but the available
          routes do not establish a separate receipt-confirmation event.
          Therefore, this screen cannot prove that a receipt is missing or that
          a shipment was lost.
        </p>
        <p className="muted">
          A custody transfer is evidence of a recorded on-chain transfer.
          It is not, by itself, proof of physical delivery or medicine quality.
        </p>
      </section>

      <div className="investigation-grid">
        <section className="card">
          <h2>Recorded custody journey</h2>
          <p className="muted">
            Events are displayed in the order supplied by the backend.
          </p>

          {history.length === 0 ? (
            <p>No recorded history is available for this batch.</p>
          ) : (
            <ol className="evidence-timeline">
              {history.map((event, index) => {
                const actorAddress =
                  event.by || event.to || event.scanner;

                let title = event.type || "Recorded event";
                let description = "";

                if (event.type === "registered") {
                  title = "Batch registered";
                  description = `Registered by ${nameOf(event.by)}`;
                } else if (event.type === "custody") {
                  title = "Custody transferred";
                  description =
                    `${nameOf(event.from)} → ${nameOf(event.to)}`;
                } else if (event.type === "dispensed") {
                  title = "Pack dispensed";
                  description = `Recorded by ${nameOf(event.by)}`;
                } else if (event.type === "duplicate") {
                  title = "Duplicate scan alert";
                  description = `Scanner: ${nameOf(event.scanner)}`;
                } else if (event.type === "recalled") {
                  title = "Batch recalled";
                  description = `Recorded by ${nameOf(event.by)}`;
                }

                return (
                  <li className="evidence-event" key={`${event.type}-${index}`}>
                    <span className="evidence-dot" aria-hidden="true" />
                    <div className="evidence-event-content">
                      <div className="evidence-event-heading">
                        <strong>{title}</strong>
                        <span className="badge good">Recorded</span>
                      </div>
                      <p>{description || `Actor: ${nameOf(actorAddress)}`}</p>
                      {event.timestamp && (
                        <p className="muted">
                          {fmtDateTime(event.timestamp)}
                        </p>
                      )}
                      {event.at && (
                        <p className="muted">{fmtDateTime(event.at)}</p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <aside>
          <section className="card">
            <h2>Evidence summary</h2>
            <div className="evidence-summary-row">
              <span>Recorded history entries</span>
              <strong>{history.length}</strong>
            </div>
            <div className="evidence-summary-row">
              <span>Recorded custody transfers</span>
              <strong>{custodyEvents.length}</strong>
            </div>
            <div className="evidence-summary-row">
              <span>Separate receipt events</span>
              <strong>Not supported</strong>
            </div>
            <div className="evidence-summary-row">
              <span>Latest recorded transfer</span>
              <strong>{latestCustody ? "Available" : "None found"}</strong>
            </div>
          </section>

          <section className="card">
            <h2>Role-aware guidance</h2>
            <p className="muted">
              Current connected role: {actor?.role || "No actor connected"}
            </p>

            {!actor && (
              <p>
                Connect a wallet and authenticate before attempting any
                protected action.
              </p>
            )}

            {actor?.role === "distributor" && (
              <p>
                Review the recorded transfer and compare it with your delivery
                documentation. A receipt cannot be recorded until a supported,
                authorized backend workflow exists.
              </p>
            )}

            {actor?.role === "pharmacy" && (
              <p>
                Review the recorded custody chain and raise a discrepancy
                through an approved workflow if your records do not match.
              </p>
            )}

            {actor?.role === "manufacturer" && (
              <p>
                Compare the original registration and recorded transfer with
                your dispatch documentation. Do not assume delivery from the
                transfer event alone.
              </p>
            )}

            {isRegulator && (
              <p>
                Review the available event history and existing alerts. Any
                investigation outcome should be supported by evidence and
                recorded through an authorized workflow.
              </p>
            )}

            {actor &&
              !isRegulator &&
              !isManufacturer &&
              !["distributor", "pharmacy"].includes(actor.role) && (
                <p>
                  Your current role has read-only guidance on this screen.
                  Contact an authorized participant to resolve discrepancies.
                </p>
              )}

            <p className="muted">
              This screen is read-only. It does not create receipt records,
              change custody, or close an investigation.
            </p>
          </section>

          <section className="card">
            <h2>Next steps</h2>
            <ul className="investigation-checklist">
              <li>Review the recorded custody history.</li>
              <li>Compare it with delivery documentation.</li>
              <li>Confirm whether the receiving party recorded the event elsewhere.</li>
              <li>Document discrepancies through an approved workflow.</li>
            </ul>

            <Link className="btn primary investigation-link" to={`/batches/${id}`}>
              Open batch details
            </Link>
            <Link className="btn investigation-link" to="/batches">
              Back to all batches
            </Link>
          </section>
        </aside>
      </div>
    </div>
  );
}
