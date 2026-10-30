import React from "react";
import EcdSoftwareCredits from "../reports/EcdSoftwareCredits.jsx";
import "@fontsource/source-sans-3/400.css";
import "@fontsource/source-sans-3/600.css";
import "@fontsource/source-sans-3/700.css";
import "@fontsource/source-serif-4/600.css";
import "@fontsource/source-serif-4/700.css";

function fmt(n, digits = 1) {
  if (n == null || Number.isNaN(n)) return "—";
  return Number(n).toFixed(digits);
}

function pct(n) {
  if (n == null || Number.isNaN(n)) return "—";
  return `${(Number(n) * 100).toFixed(1)}%`;
}

export function Band({ id, label }) {
  if (!id) return "—";
  return <span className={`ecd-band ${id}`}>{label || id}</span>;
}

export function PercentBarChart({ rows, caption }) {
  const usable = (rows || []).filter((r) => r && Number.isFinite(r.percent));
  if (usable.length === 0) return null;

  const labelW = 168;
  const plotW = 360;
  const padR = 56;
  const rowH = 28;
  const top = 8;
  const height = top + usable.length * rowH + 28;
  const width = labelW + plotW + padR;

  return (
    <figure className="ecd-figure">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={caption || "Percent by row"}>
        {[0, 25, 50, 75, 100].map((tick) => {
          const x = labelW + (tick / 100) * plotW;
          return (
            <g key={tick}>
              <line x1={x} y1={top} x2={x} y2={top + usable.length * rowH} stroke="#d9d1c4" strokeWidth="1" />
              <text x={x} y={height - 8} textAnchor="middle" fill="#5c564c" fontSize="11" fontFamily="Source Sans 3, sans-serif">
                {tick}
              </text>
            </g>
          );
        })}
        {usable.map((row, i) => {
          const y = top + i * rowH;
          const w = Math.max(0, Math.min(plotW, (row.percentDisplay ?? row.percent * 100) / 100 * plotW));
          const fill = row.band === "emerging" || row.band === "developing" ? "#6b2d3c" : "#2f5d3a";
          return (
            <g key={row.id || i}>
              <text
                x={labelW - 10}
                y={y + 16}
                textAnchor="end"
                fill="#1c1915"
                fontSize="12"
                fontFamily="Source Sans 3, sans-serif"
              >
                {(row.name || row.id || "").length > 24 ? `${(row.name || row.id).slice(0, 22)}…` : (row.name || row.id)}
              </text>
              <rect x={labelW} y={y + 6} width={w} height={14} fill={fill} />
              <text
                x={labelW + w + 6}
                y={y + 17}
                fill="#1c1915"
                fontSize="11"
                fontFamily="Source Sans 3, sans-serif"
              >
                {fmt(row.percentDisplay ?? row.percent * 100, 1)}%
              </text>
            </g>
          );
        })}
      </svg>
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  );
}

export function OccasionChart({ points, caption }) {
  const usable = (points || []).filter((p) => Number.isFinite(p.estimate));
  if (usable.length < 2) return null;

  const width = 640;
  const height = 220;
  const left = 44;
  const right = 16;
  const top = 12;
  const bottom = 36;
  const plotW = width - left - right;
  const plotH = height - top - bottom;
  const ys = usable.map((p) => p.estimate);
  const yMin = Math.min(0, ...ys);
  const yMax = Math.max(1, ...ys);
  const x = (i) => left + (usable.length === 1 ? plotW / 2 : (i / (usable.length - 1)) * plotW);
  const y = (v) => top + ((yMax - v) / (yMax - yMin || 1)) * plotH;
  const d = usable.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.estimate).toFixed(1)}`).join(" ");

  return (
    <figure className="ecd-figure">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={caption || "Estimates across occasions"}>
        <line x1={left} y1={top} x2={left} y2={top + plotH} stroke="#c9c0b3" />
        <line x1={left} y1={top + plotH} x2={left + plotW} y2={top + plotH} stroke="#c9c0b3" />
        {[yMin, (yMin + yMax) / 2, yMax].map((tick) => (
          <g key={String(tick)}>
            <line x1={left - 4} y1={y(tick)} x2={left} y2={y(tick)} stroke="#c9c0b3" />
            <text x={left - 8} y={y(tick) + 4} textAnchor="end" fill="#5c564c" fontSize="11" fontFamily="Source Sans 3, sans-serif">
              {tick.toFixed(2)}
            </text>
          </g>
        ))}
        <path d={d} fill="none" stroke="#6b2d3c" strokeWidth="2" />
        {usable.map((p, i) => (
          <g key={`${p.sessionId}-${i}`}>
            <circle cx={x(i)} cy={y(p.estimate)} r="3.5" fill="#1c1915" />
            <text x={x(i)} y={top + plotH + 16} textAnchor="middle" fill="#5c564c" fontSize="10" fontFamily="Source Sans 3, sans-serif">
              {p.timestamp ? String(p.timestamp).slice(0, 10) : p.sessionId || i + 1}
            </text>
          </g>
        ))}
      </svg>
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  );
}

function SummaryTable({ rows, empty }) {
  if (!rows?.length) {
    return <p className="ecd-note">{empty}</p>;
  }
  return (
    <div className="ecd-table-wrap">
      <table className="ecd-table">
        <thead>
          <tr>
            <th>Name</th>
            <th className="num">Items</th>
            <th className="num">Scored</th>
            <th className="num">Correct</th>
            <th className="num">Mean</th>
            <th className="num extra">SD</th>
            <th className="num extra">SE</th>
            <th className="extra">Band</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className={row.band ? `band-${row.band}` : undefined}>
              <td>
                {row.name || row.id}
                <div className="ecd-band-inline"><Band id={row.band} label={row.bandLabel} /></div>
              </td>
              <td className="num">{row.n}</td>
              <td className="num">{row.nScored}</td>
              <td className="num">{row.nCorrect}</td>
              <td className="num">{fmt(row.percentDisplay ?? (row.mean != null ? row.mean * 100 : null), 1)}%</td>
              <td className="num extra">{fmt(row.sd, 3)}</td>
              <td className="num extra">{fmt(row.se, 3)}</td>
              <td className="extra"><Band id={row.band} label={row.bandLabel} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function StudentEcdReportView({ report }) {
  if (!report) return null;
  const o = report.overview || {};

  return (
    <div className="ecd-doc" data-testid="student-ecd-report">
      <h3>Performance on this session</h3>
      <p className="ecd-lede">{report.interpretation?.headline}</p>
      <p>{report.interpretation?.body}</p>

      <table className="ecd-kv">
        <tbody>
          <tr>
            <th>Items administered</th>
            <td>{o.nItems ?? 0}</td>
          </tr>
          <tr>
            <th>Scored</th>
            <td>{o.nScored ?? 0}</td>
          </tr>
          <tr>
            <th>Correct (score ≥ 0.5)</th>
            <td>{o.nCorrect ?? 0}</td>
          </tr>
          <tr>
            <th>Mean score</th>
            <td>{o.percentDisplay == null ? "—" : `${fmt(o.percentDisplay, 1)}%`}</td>
          </tr>
          <tr>
            <th>Standard deviation</th>
            <td>{fmt(o.sd, 3)}</td>
          </tr>
          <tr>
            <th>Standard error of the mean</th>
            <td>{fmt(o.se, 3)}</td>
          </tr>
          <tr>
            <th>IRT theta</th>
            <td>{o.theta == null ? "—" : `${fmt(o.theta, 2)} (SE ${fmt(o.thetaSe, 2)})`}</td>
          </tr>
          <tr>
            <th>Selection</th>
            <td>{o.selectionStrategy || "—"}</td>
          </tr>
        </tbody>
      </table>

      <h3>Competencies</h3>
      <p>
        Each row is one competency reached through the evidence models bound to the items in this session.
        Mean is the average of scored responses (0–1). SE is the standard error of that mean when two or more
        scores are present, otherwise the binomial SE of the proportion correct.
      </p>
      <PercentBarChart
        rows={report.competencies}
        caption="Figure 1. Mean score by competency, as a percentage of the 0–1 score scale."
      />
      <SummaryTable rows={report.competencies} empty="No competency could be resolved from the items in this session." />
      {(report.competencies || []).length > 0 && (
        <>
          <h4>How to read the competency rows</h4>
          <ul className="ecd-list">
            {report.competencies.map((row) => (
              <li key={`int-${row.id}`}>{row.interpretation}</li>
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
        Evidence models name what was observed, not the competency itself. A weak evidence row means the work
        product did not activate the intended observable often enough — the claim in that model is not yet supported.
      </p>
      <PercentBarChart
        rows={report.evidence}
        caption="Figure 2. Mean score by evidence model."
      />
      <SummaryTable rows={report.evidence} empty="No evidence model is linked to the administered items." />
      {(report.evidence || []).length > 0 && (
        <ul className="ecd-list">
          {report.evidence.map((row) => (
            <li key={`eint-${row.id}`}>{row.interpretation}</li>
          ))}
        </ul>
      )}

      <h3>Tasks and task models</h3>
      <p>
        Tasks are the activities delivered in the session. Task models are the blueprints those activities instantiate.
        A gap between a strong task-model row and a weak task row is an administration issue, not a construct issue.
      </p>
      <SummaryTable rows={report.taskModels} empty="No task model is linked to the administered items." />
      <SummaryTable rows={report.tasks} empty="No task instances were scored." />

      <h3>Item-level detail</h3>
      <p>
        The selected response is what the student produced. Keys are not shown on this report.
        Unscored rows have a blank mean and do not enter the tables above.
      </p>
      {!(report.items || []).length ? (
        <p className="ecd-note">No item responses were recorded.</p>
      ) : (
        <div className="ecd-table-wrap">
          <table className="ecd-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Item</th>
                <th className="extra">Task</th>
                <th className="extra">Observation</th>
                <th className="extra">Evidence</th>
                <th>Competency</th>
                <th>Selected</th>
                <th className="num">Score</th>
              </tr>
            </thead>
            <tbody>
              {report.items.map((row) => (
                <tr key={`${row.itemId}-${row.index}`}>
                  <td className="num">{row.index}</td>
                  <td>
                    {row.itemName}
                    {row.excerpt ? <div className="ecd-muted">{row.excerpt}</div> : null}
                  </td>
                  <td className="extra">{row.taskName || row.taskId || "—"}</td>
                  <td className="extra">{row.observationName || row.observationId || "—"}</td>
                  <td className="extra">{row.evidenceModelName || row.evidenceModelId || "—"}</td>
                  <td>{row.competencyName || row.competencyId || "—"}</td>
                  <td>{row.selected || "—"}</td>
                  <td className="num">{row.score == null ? "—" : fmt(row.score, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(report.strengths || []).length > 0 && (
        <>
          <h3>Strengths on the ECD chain</h3>
          <ul className="ecd-list">
            {report.strengths.map((s) => (
              <li key={s}>{s} is at or above the mostly-secure band on the items in this session.</li>
            ))}
          </ul>
        </>
      )}

      {(report.focus || []).length > 0 && (
        <>
          <h3>Where to focus</h3>
          <ul className="ecd-list">
            {report.focus.map((s) => (
              <li key={s}>{s} is below the mostly-secure band. Use the evidence-model rows to see which observation is weak.</li>
            ))}
          </ul>
        </>
      )}

      {(report.nextSteps || []).length > 0 && (
        <>
          <h3>Next steps</h3>
          <ul className="ecd-list">
            {report.nextSteps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </>
      )}

      <OccasionChart
        points={report.occasions}
        caption="Figure 3. Student-model estimate across completed occasions for this examinee."
      />

      <EcdSoftwareCredits variant="session" />
    </div>
  );
}
