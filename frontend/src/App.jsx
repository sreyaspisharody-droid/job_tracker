import { useEffect, useState } from "react";

const apiUrl = import.meta.env.VITE_API_URL || "/api";
const statuses = ["Applied", "Interview", "Offer", "Rejected"];

async function request(path, options = {}) {
  const token = localStorage.getItem("tracker-token");
  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "Request failed. Please try again.");
    error.status = response.status;
    throw error;
  }
  return data;
}

function SignIn({ onSignIn }) {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function sendCode(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await request("/auth/send-otp", {
        method: "POST",
        body: JSON.stringify({ phone }),
      });
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await request("/auth/verify-otp", {
        method: "POST",
        body: JSON.stringify({ phone, code }),
      });
      localStorage.setItem("tracker-token", result.token);
      localStorage.setItem("tracker-phone", result.phone);
      onSignIn(result.phone);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="sign-in page-shell">
      <a className="brand" href="/" aria-label="Job Application Tracker home">
        <span className="brand-mark">J.</span> job notes
      </a>
      <section className="welcome-card">
        <div className="eyebrow"><span className="tiny-dot" /> YOUR NEXT CHAPTER</div>
        <h1>Keep every<br />opportunity <em>in view.</em></h1>
        <p className="intro">A little space to keep track of where you’ve applied, and what comes next.</p>
        <form onSubmit={sent ? verifyCode : sendCode}>
          <label htmlFor="phone">PHONE NUMBER</label>
          <input
            id="phone"
            type="tel"
            autoComplete="tel"
            placeholder="+1 555 000 0000"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            required
            disabled={sent}
          />
          {sent && (
            <>
              <label htmlFor="code">ONE-TIME CODE</label>
              <input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="Enter the code we sent"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                required
              />
            </>
          )}
          {error && <p className="error" role="alert">{error}</p>}
          <button className="primary-button" disabled={busy}>
            {busy ? "One moment…" : sent ? "Verify & sign in" : "Text me a code"}
            {!busy && <span aria-hidden="true">↗</span>}
          </button>
          {sent && (
            <button
              className="text-button"
              type="button"
              onClick={() => { setSent(false); setCode(""); setError(""); }}
            >
              Use a different number
            </button>
          )}
        </form>
        <div className="card-foot">ONE SMALL STEP AT A TIME <span>✳</span></div>
      </section>
      <p className="sign-in-note">New here? You’ll be registered when you verify your number.</p>
    </main>
  );
}

function Tracker({ phone, onSignOut }) {
  const [jobs, setJobs] = useState([]);
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [appliedOn, setAppliedOn] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function loadJobs() {
    const results = await request("/jobs");
    setJobs(results);
  }

  useEffect(() => {
    loadJobs().catch((err) => {
      if (err.status === 401) onSignOut();
      else setError(err.message);
    });
  }, []);

  async function addJob(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const job = await request("/jobs", {
        method: "POST",
        body: JSON.stringify({ company, role, appliedOn }),
      });
      setJobs((current) => [job, ...current]);
      setCompany("");
      setRole("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function updateStatus(jobId, status) {
    setError("");
    try {
      await request(`/jobs/${jobId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setJobs((current) => current.map((job) => job.id === jobId ? { ...job, status } : job));
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main className="tracker page-shell">
      <header className="topbar">
        <a className="brand" href="/"><span className="brand-mark">J.</span> job notes</a>
        <div className="account">
          <span className="account-phone">{phone}</span>
          <button className="text-button sign-out" onClick={onSignOut}>Sign out</button>
        </div>
      </header>

      <section className="tracker-heading">
        <div>
          <div className="eyebrow"><span className="tiny-dot" /> YOUR SEARCH, ORGANIZED</div>
          <h1>Good things<br className="mobile-break" /> are <em>in progress.</em></h1>
          <p className="intro">One place for every application and next step.</p>
        </div>
        <div className="count-note"><strong>{jobs.length.toString().padStart(2, "0")}</strong><span>applications<br />and counting</span></div>
      </section>

      <section className="workspace">
        <form className="add-card" onSubmit={addJob}>
          <div className="eyebrow">ADD AN APPLICATION</div>
          <label htmlFor="company">COMPANY</label>
          <input id="company" maxLength="100" placeholder="e.g. Northstar Studio" value={company} onChange={(e) => setCompany(e.target.value)} required />
          <label htmlFor="role">ROLE</label>
          <input id="role" maxLength="100" placeholder="e.g. Product Designer" value={role} onChange={(e) => setRole(e.target.value)} required />
          <label htmlFor="appliedOn">DATE APPLIED</label>
          <input id="appliedOn" type="date" value={appliedOn} onChange={(e) => setAppliedOn(e.target.value)} required />
          {error && <p className="error" role="alert">{error}</p>}
          <button className="primary-button" disabled={busy}>{busy ? "Saving…" : "Add to my list"} <span aria-hidden="true">＋</span></button>
        </form>

        <section className="applications" aria-label="Your applications">
          <div className="list-heading">
            <h2>My applications <span>{jobs.length}</span></h2>
            <span className="list-caption">LATEST FIRST</span>
          </div>
          {jobs.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">↗</div>
              <h3>Your list starts here.</h3>
              <p>Add the first opportunity you’re working toward.</p>
            </div>
          ) : (
            <div className="job-list">
              {jobs.map((job) => (
                <article className="job-row" key={job.id}>
                  <div className="job-monogram" aria-hidden="true">{job.company.charAt(0).toUpperCase()}</div>
                  <div className="job-details">
                    <h3>{job.role}</h3>
                    <p>{job.company} <span>·</span> {new Date(`${job.appliedOn}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</p>
                  </div>
                  <label className={`status status-${job.status.toLowerCase()}`}>
                    <span className="status-dot" />
                    <select aria-label={`Status for ${job.role} at ${job.company}`} value={job.status} onChange={(event) => updateStatus(job.id, event.target.value)}>
                      {statuses.map((status) => <option key={status}>{status}</option>)}
                    </select>
                  </label>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
      <footer className="footer-note">MADE FOR THE MILE BETWEEN “APPLIED” AND “HELLO” <span>✳</span></footer>
    </main>
  );
}

export default function App() {
  const [phone, setPhone] = useState(() => localStorage.getItem("tracker-phone") || "");

  function signOut() {
    localStorage.removeItem("tracker-token");
    localStorage.removeItem("tracker-phone");
    setPhone("");
  }

  return phone
    ? <Tracker phone={phone} onSignOut={signOut} />
    : <SignIn onSignIn={setPhone} />;
}
