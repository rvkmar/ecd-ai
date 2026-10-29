import React from "react";
import { Band, PercentBarChart } from "../sessions/StudentEcdReportView.jsx";
import "../sessions/StudentEcdReport.css";

function fmt(n, digits = 1) {
  if (n == null || Number.isNaN(n)) return "—";
  return Number(n).toFixed(digits);
}

function pct(n) {
  if (n == null || Number.isNaN(n)) return "—";
  return `${Number(n).toFixed(1)}%`;
}

const BAND_COLORS = {
  emerging: "#8a2e2e",
  developing: "#8a5a12",
  "mostly-secure": "#4d6b3c",
  secure: "#2f5d3a",
};

export function BandStackChart({ rows, caption }) {
  const usable = (rows || []).filter((r) => r && !r.suppressed && (r.nStudents || 0) > 0);
  if (!usable.length) return null;

  const labelW = 168;
  const plotW = 360;
  const padR = 72;
  const rowH = 28;
  const top = 10;
  const axisH = 28;
  const height = top + usable.length * rowH + axisH;
  const width = labelW + plotW + padR;
  const plotBottom = top + usable.length * rowH;

  return (
    <figure className="ecd-figure">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={caption || "Students by band"}>
        <rect x={labelW} y={top} width={plotW} height={usable.length * rowH} fill="#fbf7f0" />
        {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
          const x = labelW + tick * plotW;
          return (
            <g key={tick}>
              <line x1={x} y1={top} x2={x} y2={plotBottom} stroke="#d9d1c4" strokeWidth="1" />
              <line x1={x} y1={plotBottom} x2={x} y2={plotBottom + 5} stroke="#5c564c" />
              <text x={x} y={height - 8} textAnchor="middle" fill="#5c564c" fontSize="11" fontFamily="Source Sans 3, sans-serif">
                {Math.round(tick * 100)}%
              </text>
            </g>
          );
        })}
        {usable.map((row, i) => {
          const n = row.nStudents || 0;
          const parts = [
            ["emerging", row.nEmerging || 0],
            ["developing", row.nDeveloping || 0],
            ["mostly-secure", row.nMostlySecure || 0],
            ["secure", row.nSecure || 0],
          ];
          let x = labelW;
          const y = top + i * rowH;
          return (
            <g key={row.id || i}>
              <text x={labelW - 10} y={y + 18} textAnchor="end" fill="#1c1915" fontSize="12" fontFamily="Source Sans 3, sans-serif">
                {(row.name || row.id || "").length > 24 ? `${(row.name || row.id).slice(0, 22)}…` : (row.name || row.id)}
              </text>
              {parts.map(([id, count]) => {
                const w = n ? (count / n) * plotW : 0;
                const el = (
                  <rect key={id} x={x} y={y + 7} width={Math.max(0, w)} height={14} fill={BAND_COLORS[id]} />
                );
                x += w;
                return el;
              })}
              <text x={labelW + plotW + 8} y={y + 18} fill="#1c1915" fontSize="11" fontFamily="Source Sans 3, sans-serif">
                {n}
              </text>
            </g>
          );
        })}
        <rect x={labelW} y={top} width={plotW} height={usable.length * rowH} fill="none" stroke="#1c1915" strokeWidth="1.2" />
      </svg>
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  );
}

function GroupTable({ rows, empty, groupCounts = true }) {
  if (!rows?.length) return <p className="ecd-note">{empty}</p>;
  return (
    <div className="ecd-table-wrap">
      <table className="ecd-table">
        <thead>
          <tr>
            <th>Name</th>
            {groupCounts ? <th className="num">Students</th> : null}
            <th className="num">Sessions</th>
            <th className="num extra">Items</th>
            <th className="num">Mean</th>
            {groupCounts ? <th className="num extra">Emerging</th> : null}
            {groupCounts ? <th className="num extra">Developing</th> : null}
            {groupCounts ? <th className="num extra">Mostly secure</th> : null}
            {groupCounts ? <th className="num extra">Secure</th> : null}
            <th className="extra">Band</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className={row.suppressed ? "suppressed" : row.band ? `band-${row.band}` : undefined}>
              <td>
                {row.name || row.id}
                <div className="ecd-band-inline">
                  {row.suppressed ? "Suppressed" : <Band id={row.band} label={row.bandLabel} />}
                </div>
              </td>
              {groupCounts ? (
                <td className="num">{row.suppressed ? "n < 5" : row.nStudents ?? "—"}</td>
              ) : null}
              <td className="num">{row.suppressed ? "—" : row.nSessions ?? "—"}</td>
              <td className="num extra">{row.suppressed ? "—" : row.n ?? "—"}</td>
              <td className="num">{row.suppressed ? "—" : pct(row.percentDisplay)}</td>
              {groupCounts ? <td className="num extra">{row.suppressed ? "—" : row.nEmerging ?? "—"}</td> : null}
              {groupCounts ? <td className="num extra">{row.suppressed ? "—" : row.nDeveloping ?? "—"}</td> : null}
              {groupCounts ? <td className="num extra">{row.suppressed ? "—" : row.nMostlySecure ?? "—"}</td> : null}
              {groupCounts ? <td className="num extra">{row.suppressed ? "—" : row.nSecure ?? "—"}</td> : null}
              <td className="extra">{row.suppressed ? "Suppressed" : <Band id={row.band} label={row.bandLabel} />}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StudentTable({ rows }) {
  if (!rows?.length) return <p className="ecd-note">No students in this classroom scope.</p>;
  return (
    <div className="ecd-table-wrap">
      <table className="ecd-table">
        <thead>
          <tr>
            <th>Student</th>
            <th className="extra">Class</th>
            <th className="num">Sessions</th>
            <th className="num">Mean</th>
            <th>Weakest competency</th>
            <th className="extra">Strongest competency</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className={row.band ? `band-${row.band}` : undefined}>
              <td>
                {row.name || row.id}
                <div className="ecd-band-inline"><Band id={row.band} label={row.bandLabel} /></div>
              </td>
              <td className="extra">{row.classId || "—"}</td>
              <td className="num">{row.nSessions ?? "—"}</td>
              <td className="num">{pct(row.percentDisplay)}</td>
              <td>
                {row.weakestCompetency
                  ? `${row.weakestCompetency.name} (${fmt(row.weakestCompetency.percentDisplay, 0)}%)`
                  : "—"}
              </td>
              <td className="extra">
                {row.strongestCompetency
                  ? `${row.strongestCompetency.name} (${fmt(row.strongestCompetency.percentDisplay, 0)}%)`
                  : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CellTable({ rows, label }) {
  if (!rows?.length) return null;
  return (
    <div className="ecd-table-wrap">
      <table className="ecd-table">
        <thead>
          <tr>
            <th>{label}</th>
            <th className="num">Students</th>
            <th className="num">Sessions</th>
            <th className="num">Mean</th>
            <th>Band</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className={row.suppressed ? "suppressed" : undefined}>
              <td>{row.id}</td>
              <td className="num">{row.suppressed ? "n < 5" : row.nStudents ?? "—"}</td>
              <td className="num">{row.suppressed ? "—" : row.nSessions ?? "—"}</td>
              <td className="num">{row.suppressed ? "—" : pct(row.percentDisplay)}</td>
              <td>{row.suppressed ? "Suppressed" : <Band id={row.band} label={row.bandLabel} />}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function titlesFor(kind) {
  if (kind === "student") {
    return {
      title: "Cumulative student report",
      sub: "Strengths and weaknesses across closed sessions, joined through tasks, evidence models, and competencies.",
    };
  }
  if (kind === "teacher") {
    return {
      title: "Classroom cumulative report",
      sub: "Where to spend class time, from student performance on competencies arrived at through evidence and tasks.",
    };
  }
  return {
    title: "Curriculum cumulative report",
    sub: "District and administrative view for curriculum planning. Named students are omitted. Small cells are suppressed.",
  };
}

export default function CumulativeEcdReportView({ report }) {
  if (!report) return null;
  const kind = report.kind || "student";
  const o = report.overview || {};
  const who =
    kind === "student"
      ? report.student?.name || report.student?.id
      : kind === "teacher"
        ? report.teacher?.name || report.teacher?.id
        : report.districtId || "All districts";

  return (
    <div className="ecd-doc" data-testid={`cumulative-ecd-${kind}`}>
      <p className="ecd-lede">{report.interpretation?.headline}</p>
      <p>{report.interpretation?.body}</p>

      <table className="ecd-kv">
        <tbody>
          <tr>
            <th>{kind === "student" ? "Student" : kind === "teacher" ? "Teacher" : "Scope"}</th>
            <td>{who || "—"}</td>
          </tr>
          <tr>
            <th>Closed sessions</th>
            <td>{o.suppressed ? "n < 5" : o.nSessions ?? 0}</td>
          </tr>
          {kind !== "student" && (
            <tr>
              <th>Students</th>
              <td>{o.suppressed ? "n < 5" : o.nStudents ?? 0}</td>
            </tr>
          )}
          <tr>
            <th>Scored responses</th>
            <td>{o.suppressed ? "—" : o.nScored ?? 0}</td>
          </tr>
          <tr>
            <th>Cumulative mean</th>
            <td>{o.suppressed || o.percentDisplay == null ? "—" : `${fmt(o.percentDisplay, 1)}%`}</td>
          </tr>
          <tr>
            <th>Window</th>
            <td>{o.from && o.to ? (o.from === o.to ? o.from : `${o.from} – ${o.to}`) : "—"}</td>
          </tr>
        </tbody>
      </table>

      <h3>Competencies</h3>
      <p>
        {kind === "student"
          ? "Each row pools scored items for that competency across closed sessions. Delta is the change in session mean from the first occasion to the last."
          : "Each row is the mean of per-student means, so one heavily tested student does not dominate. Student counts say how many examinees contributed."}
      </p>
      <PercentBarChart
        rows={(report.competencies || []).filter((r) => !r.suppressed)}
        caption="Figure 1. Mean score by competency."
      />
      {kind !== "student" && (
        <BandStackChart
          rows={report.competencies}
          caption="Figure 2. Share of students in each performance band, by competency."
        />
      )}
      <GroupTable
        rows={report.competencies}
        groupCounts={kind !== "student"}
        empty="No competency could be resolved from closed sessions."
      />
      {(report.competencies || []).length > 0 && (
        <>
          <h4>How to read the competency rows</h4>
          <ul className="ecd-list">
            {report.competencies.map((row) => (
              <li key={`cint-${row.id}`}>{row.interpretation}</li>
            ))}
          </ul>
        </>
      )}
      {(report.guideNotes || []).length > 0 && (
        <ul className="ecd-list">
          {report.guideNotes.map((note) => (
            <li key={`guide-${note.competencyId}`}>
              {note.name}: {note.guide}
            </li>
          ))}
        </ul>
      )}

      <h3>Evidence models</h3>
      <p>
        Evidence models name what was observed. A weak evidence row with a stronger competency row means some observations on that construct are holding the claim up, and others are not.
      </p>
      <PercentBarChart
        rows={(report.evidence || []).filter((r) => !r.suppressed)}
        caption={kind === "student" ? "Figure 2. Mean score by evidence model." : "Figure 3. Mean score by evidence model."}
      />
      <GroupTable
        rows={report.evidence}
        groupCounts={kind !== "student"}
        empty="No evidence model is linked to the scored items."
      />
      {(report.evidence || []).length > 0 && (
        <ul className="ecd-list">
          {report.evidence.map((row) => (
            <li key={`eint-${row.id}`}>{row.interpretation}</li>
          ))}
        </ul>
      )}

      <h3>Tasks and task models</h3>
      <p>
        Tasks are the activities students sat. Task models are the blueprints. Thin task coverage on a weak competency is a curriculum gap, not only an instructional one.
      </p>
      <GroupTable
        rows={report.taskModels}
        groupCounts={kind !== "student"}
        empty="No task model is linked to the scored items."
      />
      <GroupTable
        rows={report.tasks}
        groupCounts={kind !== "student"}
        empty="No task instances were scored."
      />

      {kind === "student" && (
        <>
          <h3>Sessions in this history</h3>
          <p>Open a session report from Delivery → Reports to see item-level detail for one occasion. Keys are not shown here.</p>
          {!(report.sessions || []).length ? (
            <p className="ecd-note">No closed sessions yet.</p>
          ) : (
            <div className="ecd-table-wrap">
              <table className="ecd-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Session</th>
                    <th className="num">Items</th>
                    <th className="num">Mean</th>
                    <th>Band</th>
                  </tr>
                </thead>
                <tbody>
                  {report.sessions.map((row) => (
                    <tr key={row.sessionId}>
                      <td>{row.finishedAt ? String(row.finishedAt).slice(0, 10) : "—"}</td>
                      <td>{row.sessionId}</td>
                      <td className="num">{row.nItems ?? "—"}</td>
                      <td className="num">{pct(row.percentDisplay)}</td>
                      <td><Band id={row.band} label={row.bandLabel} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {kind === "teacher" && (
        <>
          <h3>Students</h3>
          <p>Named because this is the teacher of record. Sorted from weakest cumulative mean to strongest so the next conversation is obvious.</p>
          <StudentTable rows={report.students} />
        </>
      )}

      {kind === "district" && (
        <>
          {(report.schools || []).length > 0 && (
            <>
              <h3>Schools</h3>
              <CellTable rows={report.schools} label="School" />
            </>
          )}
          {(report.classes || []).length > 0 && (
            <>
              <h3>Classes</h3>
              <CellTable rows={report.classes} label="Class" />
            </>
          )}
          {(report.districts || []).length > 0 && (
            <>
              <h3>Districts</h3>
              <CellTable rows={report.districts} label="District" />
            </>
          )}
        </>
      )}

      {(report.nextSteps || []).length > 0 && (
        <>
          <h3>{kind === "district" ? "Curriculum plan" : kind === "teacher" ? "What to focus on in class" : "Next steps"}</h3>
          <ul className="ecd-list">
            {report.nextSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
        </>
      )}

      {kind === "student" && (report.strengths || []).length > 0 && (
        <>
          <h3>Strengths across sessions</h3>
          <ul className="ecd-list">
            {report.strengths.map((name) => (
              <li key={name}>{name} is at or above the mostly-secure band on the cumulative record.</li>
            ))}
          </ul>
        </>
      )}

      {kind === "student" && (report.focus || []).length > 0 && (
        <>
          <h3>Where to focus</h3>
          <ul className="ecd-list">
            {report.focus.map((name) => (
              <li key={name}>{name} is below the mostly-secure band across closed sessions.</li>
            ))}
          </ul>
        </>
      )}

    </div>
  );
}

export { titlesFor };
