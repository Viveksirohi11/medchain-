import { NavLink, Route, Routes } from "react-router-dom";
import { useActor } from "./actor.jsx";

import Dashboard from "./pages/Dashboard.jsx";
import Verify from "./pages/Verify.jsx";
import Batches from "./pages/Batches.jsx";
import BatchDetail from "./pages/BatchDetail.jsx";
import CreateBatch from "./pages/CreateBatch.jsx";
import Investigation from "./pages/Investigation.jsx";

export default function App() {
  const {
    actor,
    connected,
    loading,
    connect,
    logout
  } = useActor();

  return (
    <>
      <header className="topbar">
        <div className="brand">
          {"◆ MedChain"}
        </div>

        <nav>
          <NavLink to="/" end>
            Dashboard
          </NavLink>

          <NavLink to="/verify">
            Verify a pack
          </NavLink>

          <NavLink to="/batches">
            Search batches
          </NavLink>

          <NavLink to="/new">
            New batch
          </NavLink>
        </nav>

        <div className="actor">
          {!connected ? (
            <button
              type="button"
onClick={async () => {
  try {
    await connect();
  } catch (error) {
    window.alert(
      error?.message || "Wallet connection failed"
    );
  }
}}              disabled={loading}
            >
              {loading
                ? "Connecting..."
                : "Connect Wallet"}
            </button>
          ) : (
            <>
              <span>
                {actor.address.slice(0, 6)}...
                {actor.address.slice(-4)}
              </span>

              <button
                type="button"
                onClick={logout}
              >
                Logout
              </button>
            </>
          )}
        </div>
      </header>

      <main>
        <Routes>
          <Route
            path="/"
            element={<Dashboard />}
          />

          <Route
            path="/verify"
            element={<Verify />}
          />

          <Route
            path="/batches"
            element={<Batches />}
          />
          <Route
            path="/batches/:id/investigation"
            element={<Investigation />}
          />

          <Route
            path="/batches/:id"
            element={<BatchDetail />}
          />

          <Route
            path="/new"
            element={<CreateBatch />}
          />

          <Route
            path="*"
            element={<p>Page not found.</p>}
          />
        </Routes>
      </main>

      <footer>
        Demo mode: the server signs transactions
        with local test accounts. Not for real
        medicines.
      </footer>
    </>
  );
}
