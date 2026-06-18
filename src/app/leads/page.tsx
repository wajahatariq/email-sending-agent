"use client";

import { useCallback, useRef, useState } from "react";
import "./leads.scoped.css";

const COUNTRY_OPTIONS: { value: string; label: string }[] = [
  { value: "united_states", label: "United States" },
  { value: "australia", label: "Australia" },
  { value: "canada", label: "Canada" },
  { value: "united_kingdom", label: "United Kingdom (England)" },
  { value: "ireland", label: "Ireland" },
  { value: "new_zealand", label: "New Zealand" },
];

interface LeadRow {
  name: string;
  company: string;
  email: string;
  emailType: "role" | "personal";
  sourceUrl: string;
}

export default function Page() {
  const [country, setCountry] = useState("united_states");
  const [niche, setNiche] = useState("");
  const [running, setRunning] = useState(false);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [stage, setStage] = useState("");
  const [runId, setRunId] = useState<number | null>(null);
  const [campaignId, setCampaignId] = useState("");
  const [pushMsg, setPushMsg] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(async () => {
    if (running || niche.trim().length < 2) return;
    setRunning(true);
    setLeads([]);
    setRunId(null);
    setPushMsg("");
    setStage("planning queries");

    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ country, nichePrompt: niche.trim() }),
        signal: ac.signal,
      });
      if (!res.body) throw new Error("no stream");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        // Split on SSE frame boundary (blank line).
        let idx: number;
        while ((idx = buf.indexOf("\n\n")) !== -1) {
          const frame = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          handleFrame(frame);
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setStage("error: " + (err as Error).message);
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }, [country, niche, running]);

  function handleFrame(frame: string) {
    let event = "message";
    let data = "";
    for (const line of frame.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data += line.slice(5).trim();
    }
    if (!data) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      return;
    }

    if (event === "lead") {
      const lead = parsed as LeadRow;
      setLeads((prev) => [...prev, lead]);
    } else if (event === "status") {
      const s = parsed as { stage?: string; found?: number };
      if (s.stage) setStage(s.stage);
    } else if (event === "done") {
      const d = parsed as { total: number; runId: number };
      setRunId(d.runId);
      setStage(`done — ${d.total} leads`);
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  async function push() {
    if (!runId || !campaignId.trim()) return;
    setPushMsg("pushing...");
    try {
      const res = await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId, campaignId: Number(campaignId) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "push failed");
      setPushMsg(`inserted ${json.inserted}, skipped ${json.skipped}`);
    } catch (err) {
      setPushMsg("error: " + (err as Error).message);
    }
  }

  return (
    <div id="leadgen-root">
    <main className="wrap">
      <h1>Lead Extraction Agent</h1>
      <p className="sub">
        Country + niche. Searches the web, crawls sites, extracts and MX-validates emails.
      </p>

      <div className="panel">
        <div className="row">
          <div>
            <label htmlFor="country">Country</label>
            <select
              id="country"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              disabled={running}
            >
              {COUNTRY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="niche">Niche</label>
            <textarea
              id="niche"
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
              placeholder="vegan bakeries with their own website"
              disabled={running}
            />
          </div>
        </div>
        <div className="toolbar">
          {!running ? (
            <button onClick={run} disabled={niche.trim().length < 2}>
              Run
            </button>
          ) : (
            <button className="btn-ghost" onClick={stop}>
              Stop
            </button>
          )}
          <div className="status">
            {running && <span className="spinner" />}
            <span>
              <span className="count">{leads.length}</span> leads
            </span>
            {stage && <span>&middot; {stage}</span>}
          </div>
        </div>
      </div>

      {leads.length > 0 && (
        <div className="panel">
          <div className="toolbar">
            {runId != null && (
              <a className="btn-ghost" href={`/api/export?runId=${runId}`} role="button"
                style={{ padding: "9px 16px", borderRadius: 8 }}>
                Download CSV
              </a>
            )}
            <input
              style={{ width: 160 }}
              placeholder="campaign id"
              value={campaignId}
              onChange={(e) => setCampaignId(e.target.value)}
            />
            <button
              className="btn-ghost"
              onClick={push}
              disabled={runId == null || !campaignId.trim()}
            >
              Push to campaign
            </button>
            {pushMsg && <span className="status">{pushMsg}</span>}
          </div>

          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l, i) => (
                <tr key={l.email + i}>
                  <td>{l.name}</td>
                  <td>
                    <a href={`mailto:${l.email}`}>{l.email}</a>
                    <span className={`tag tag-${l.emailType}`}>{l.emailType}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="note">
            Emails are MX-validated, not delivery-guaranteed. Suppressed/unsubscribed
            addresses are excluded. Verify volume before bulk sending.
          </p>
        </div>
      )}
    </main>
    </div>
  );
}
