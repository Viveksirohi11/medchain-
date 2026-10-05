import { NavLink, Route, Routes } from "react-router-dom";
import { useActor } from "./actor.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Verify from "./pages/Verify.jsx";
import Batches from "./pages/Batches.jsx";
import BatchDetail from "./pages/BatchDetail.jsx";
import CreateBatch from "./pages/CreateBatch.jsx";

export default function App() {
  const { actors, actor, setActor } = useActor();
  return (
    <>
      <header className="topbar">
        <div className="brand">⛓ MedChain</div>
        <nav>
          <NavLink to="/" end>Dashboard</NavLink>
          <NavLink to="/verify">Verify a pack</NavLink>
          <NavLink to="/batches">Search batches</NavLink>
          <NavLink to="/new">New batch</NavLink>
        </nav>
        <label className="actor">
          Acting as
          <select value={actor?.address || ""} onChange={(e) => setActor(e.target.value)}>
            <option value="">Patient (no login)</option>
            {actors.map((a) => (
              <option key={a.address} value={a.address}>{a.name || a.address.slice(0, 8)} · {a.role}</option>
            ))}
          </select>
        </label>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/verify" element={<Verify />} />
          <Route path="/batches" element={<Batches />} />
          <Route path="/batches/:id" element={<BatchDetail />} />
          <Route path="/new" element={<CreateBatch />} />
          <Route path="*" element={<p>Page not found.</p>} />
        </Routes>
      </main>
      <footer>Demo mode: the server signs transactions with local test accounts. Not for real medicines.</footer>
    </>
  );
}
