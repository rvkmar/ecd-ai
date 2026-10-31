import React, { useEffect, useState } from "react";
import { usePolicies } from "../../api/queries/policies";
import { useAuth } from "../../auth/AuthProvider";
import { apiFetch } from "../../api/apiClient";
import { can } from "../../config/rolePermissions";
import { measurementStopHeading, measurementStopDetails } from "./measurementStop";
import { assemblyProgressLine } from "../../utils/assemblyConstraints";
import AttributeProfileList from "./AttributeProfileList";
import { RecordCard } from "../reports/StudentModelRecordPanel";
import StudentEcdReportView from "./StudentEcdReportView";
import { ReportClaims, ReportLevelMeta } from "../reports/ReportLevelBits";
import "./StudentEcdReport.css";

function formatProbability(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "unknown";
  return `${Math.round(value * 1000) / 10}%`;
}

function formatTimeOnItem(ms) {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) return "Unknown";
  const seconds = Math.round(ms / 100) / 10;
  return `${seconds} s`;
}

function responseTimingText(row) {
  if (row?.rapidGuessStatus !== "rapid" && row?.rapidGuessStatus !== "engaged") {
    return "Timing unknown.";
  }
  const label = row.rapidGuessStatus === "rapid" ? "Rapid guess." : "Not a rapid guess.";
  const clock = row.presentedAtSource === "client"
    ? " (client clock)"
    : row.presentedAtSource === "server"
      ? " (server clock)"
      : "";
  return `Time ${formatTimeOnItem(row.timeOnItemMs)}${clock}. ${label}`;
}

function rapidGuessRateText(summary) {
  if (!summary) return "Rapid-guess rate: unknown.";
  const rate = typeof summary.rapidGuessRate === "number" && Number.isFinite(summary.rapidGuessRate)
    ? `${Math.round(summary.rapidGuessRate * 1000) / 10}%`
    : "unknown";
  const timed = summary.timedResponseCount || 0;
  const rapid = summary.rapidGuessCount || 0;
  const unknown = summary.unknownResponseCount || 0;
  const unknownNote = unknown > 0 ? ` ${unknown} without timing.` : "";
  return `Rapid-guess rate: ${rate} (${rapid} of ${timed} timed responses).${unknownNote}`;
}

function BnPosteriorList({ nodes }) {
  const entries = Object.entries(nodes || {}).filter(([, row]) => row && typeof row === "object");
  if (entries.length === 0) return null;
  return (
    <div data-testid="bn-posteriors">
      <h4 className="font-semibold">Bayesian network</h4>
      <ul className="list-disc ml-5 text-sm">
        {entries.map(([node, row]) => {
          const distribution = row.distribution && typeof row.distribution === "object"
            ? Object.entries(row.distribution)
              .map(([state, probability]) => `${state} ${formatProbability(probability)}`)
              .join(", ")
            : "";
          return (
            <li key={node}>
              <span className="font-medium">{node}</span>
              {": "}
              {formatProbability(row.probability ?? row.posterior)}
              {row.level ? ` (${row.level})` : ""}
              <ReportLevelMeta row={row} />
              {distribution ? <span className="text-gray-600"> {distribution}</span> : null}
              <ReportClaims row={row} className="text-sm text-gray-600" />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// SessionReport.jsx
// Props:
// - sessionId: string (required)
// - onClose?: callback to close modal/view
//
// D59: fetches are role-split. Every authenticated role may load
//   /api/reports/session/:id
//   /api/reports/session/:id/learner-feedback
// Staff (admin / district / teacher) also load
//   /api/reports/session/:id/teacher-report
// An examinee must not request that last payload — the server now
// refuses it, and this component must not ask.

export default function SessionReport({ sessionId, onClose }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [report, setReport] = useState(null);
  const [learnerFeedback, setLearnerFeedback] = useState(null);
  const [teacherReport, setTeacherReport] = useState(null);
  const [tab, setTab] = useState("learner");

  const { auth } = useAuth() || {};
  const { data: policies = [] } = usePolicies();
  const canViewTeacherReports = can(auth?.role, "view", "teacherReports");

  const getPolicyName = (policyId) => {
    if (!policyId) return null;
    const p = (policies || []).find((pol) => pol.id === policyId);
    return p ? p.name : policyId;
  };

  useEffect(() => {
    if (!sessionId) return;
    setLoading(true);
    setError(null);
    setTeacherReport(null);

    const requests = [
      apiFetch(`/api/reports/session/${sessionId}`, {}, auth),
      apiFetch(`/api/reports/session/${sessionId}/learner-feedback`, {}, auth),
    ];
    if (canViewTeacherReports) {
      requests.push(apiFetch(`/api/reports/session/${sessionId}/teacher-report`, {}, auth));
    }

    Promise.allSettled(requests)
      .then((results) => {
        const [rep, learner, teacher] = results.map((r) =>
          r.status === "fulfilled" ? r.value : null
        );
        if (!rep && !learner && !teacher) {
          setError("Failed to load report");
          return;
        }
        setReport(rep);
        setLearnerFeedback(learner);
        setTeacherReport(teacher || null);
        if (!canViewTeacherReports && tab === "teacher") setTab("learner");
      })
      .finally(() => setLoading(false));
  }, [sessionId, canViewTeacherReports]);

  if (!sessionId) return null;
  if (loading) return <div className="p-4">Loading report...</div>;
  if (error) {
    return (
      <div className="p-4">
        <p className="text-red-600">{error}</p>
        {onClose && (
          <button type="button" onClick={onClose} className="mt-2 px-3 py-1 bg-gray-300 rounded">
            Close
          </button>
        )}
      </div>
    );
  }

  const stopped = report?.stopped || learnerFeedback?.stopped || teacherReport?.stopped || null;
  const attributeProfile =
    report?.attributeProfile ||
    learnerFeedback?.attributeProfile ||
    teacherReport?.attributeProfile ||
    [];
  const stopDetails = measurementStopDetails(stopped);
  const ecdReport = report?.ecdReport || learnerFeedback?.ecdReport || null;

  return (
    <div className="ecd-sheet p-4">
      <div className="ecd-toolbar ecd-no-print">
        <button type="button" onClick={() => window.print()}>Print report</button>
        {onClose && (
          <button type="button" onClick={onClose}>Close</button>
        )}
      </div>

      <div className="ecd-paper">
      <h2 className="ecd-title">Session Report: {sessionId}</h2>
      <p className="ecd-sub">Learner performance on tasks, evidence, and competencies</p>

      {(stopped || attributeProfile.length > 0) && (
        <div className="ecd-header-measure" data-testid="report-header-measurement">
          {stopped ? (
            <>
              <p className="font-medium">{measurementStopHeading(stopped)}</p>
              {stopped.reason && (
                <p className="ecd-note mt-1">{stopped.reason}</p>
              )}
            </>
          ) : (
            <p className="font-medium">Attribute profile</p>
          )}
          <AttributeProfileList attributes={attributeProfile.length ? attributeProfile : stopDetails} />
        </div>
      )}

      {(report?.student || teacherReport?.studentId) && (
        <div className="ecd-student" data-testid="report-student">
          <div>
            Student id: <strong>{report?.student?.id || teacherReport?.studentId}</strong>
          </div>
          <div>
            Student name: <strong>{report?.student?.name || teacherReport?.studentName || "—"}</strong>
          </div>
        </div>
      )}

      <div className="ecd-tabs ecd-no-print">
        <button
          type="button"
          aria-selected={tab === "learner"}
          onClick={() => setTab("learner")}
        >
          Learner Feedback
        </button>
        {canViewTeacherReports && (
          <button
            type="button"
            aria-selected={tab === "teacher"}
            onClick={() => setTab("teacher")}
          >
            Teacher Report
          </button>
        )}
        <button
          type="button"
          aria-selected={tab === "raw"}
          onClick={() => setTab("raw")}
        >
          Raw JSON
        </button>
      </div>

      {tab === "learner" && (
        <div className="space-y-3">
          <StudentEcdReportView report={ecdReport} />
          {learnerFeedback && (
            <>
          <h3 className="font-semibold">Summary</h3>
          <p className="text-gray-700">
            Level: {learnerFeedback.summary?.level}
            <ReportLevelMeta row={learnerFeedback.summary} />
          </p>
          <ReportClaims row={learnerFeedback.summary} className="text-sm text-gray-700" />
          <p className="text-gray-700">{learnerFeedback.summary?.message}</p>

          {learnerFeedback.itemFeedback?.length > 0 && (
            <div data-testid="learner-item-feedback">
              <h4 className="font-semibold">Item feedback</h4>
              <ul className="list-disc ml-5">
                {learnerFeedback.itemFeedback.map((row, i) => (
                  <li
                    key={`${row.itemId || "item"}-${row.taskId || i}-${i}`}
                    data-feedback-rule={row.rule || ""}
                  >
                    {row.text}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {learnerFeedback.assemblyProgress?.assemblyModelId && (
            <p className="text-gray-700">
              Assembly progress: {assemblyProgressLine(learnerFeedback.assemblyProgress)}
            </p>
          )}

          {stopped && (
            <div>
              <h4 className="font-semibold">Why this session ended</h4>
              <p className="text-gray-700">{measurementStopHeading(stopped)}</p>
              {stopped.reason && <p className="text-sm text-gray-600">{stopped.reason}</p>}
            </div>
          )}

          {attributeProfile.length > 0 && (
            <div>
              <h4 className="font-semibold">Attribute profile</h4>
              <AttributeProfileList attributes={attributeProfile} />
            </div>
          )}

          <BnPosteriorList nodes={learnerFeedback.bayesianNetwork} />

          {learnerFeedback.strengths?.length > 0 && (
            <div>
              <h4 className="font-semibold">Strengths</h4>
              <ul className="list-disc ml-5">
                {learnerFeedback.strengths.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          )}

          {learnerFeedback.focusAreas?.length > 0 && (
            <div>
              <h4 className="font-semibold">Focus Areas</h4>
              <ul className="list-disc ml-5">
                {learnerFeedback.focusAreas.map((f, i) => <li key={i}>{f}</li>)}
              </ul>
            </div>
          )}

          {learnerFeedback.nextSteps?.length > 0 && (
            <div>
              <h4 className="font-semibold">Next Steps</h4>
              <ul className="list-disc ml-5">
                {learnerFeedback.nextSteps.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
            </div>
          )}

          <p className="italic text-gray-600 mt-2">{learnerFeedback.encouragement}</p>

          {learnerFeedback.studentModelRecords?.length > 0 && (
            <div data-testid="student-model-records">
              <h4 className="font-semibold">Across occasions</h4>
              {learnerFeedback.studentModelRecords.map((record) => (
                <RecordCard key={record.id} record={record} />
              ))}
            </div>
          )}
            </>
          )}
        </div>
      )}

      {tab === "teacher" && canViewTeacherReports && teacherReport && (
        <div className="space-y-3">
          <StudentEcdReportView report={teacherReport.ecdReport || ecdReport} />
          <h3 className="font-semibold">Teacher Report</h3>
            <p className="text-gray-700">
            Strategy: {teacherReport.selectionStrategy || teacherReport.strategy}
              {teacherReport.nextTaskPolicy?.policyId && (
                <span className="ml-2 text-sm text-gray-600">
                  (Policy: {getPolicyName(teacherReport.nextTaskPolicy.policyId)})
                </span>
              )}
            </p>
          {teacherReport.studentName && (
            <p className="text-gray-700">Student: {teacherReport.studentName}</p>
          )}

          {teacherReport.assemblyProgress?.assemblyModelId && (
            <p className="text-gray-700" data-testid="teacher-assembly-progress">
              Assembly progress: {assemblyProgressLine(teacherReport.assemblyProgress)}
            </p>
          )}

          {stopped && (
            <div>
              <h4 className="font-semibold">Stop reason</h4>
              <p className="text-gray-700">{measurementStopHeading(stopped)}</p>
              {stopped.reason && <p className="text-sm text-gray-600">{stopped.reason}</p>}
            </div>
          )}

          {attributeProfile.length > 0 && (
            <div>
              <h4 className="font-semibold">Attribute profile</h4>
              <AttributeProfileList attributes={attributeProfile} />
            </div>
          )}

          <div data-testid="teacher-response-timing">
            <h4 className="font-semibold">Response timing</h4>
            <p className="text-gray-700" data-testid="rapid-guess-rate">
              {rapidGuessRateText(teacherReport.responseTiming)}
            </p>
            {teacherReport.responseTiming?.ruleSummary && (
              <p className="text-xs text-gray-500">{teacherReport.responseTiming.ruleSummary}</p>
            )}
          </div>

          <div>
            <h4 className="font-semibold">Responses</h4>
            <ul className="list-disc ml-5 text-sm">
              {teacherReport.responses?.map((r, i) => (
                <li key={i}>
                  Activity {r.taskId}: {r.rawAnswer || r.rubricLevel || r.scoredValue || "-"}{" "}
                  <span className="text-gray-500 text-xs">
                    [C: {r.competencyId || "?"}, E: {r.evidenceId || "?"}]
                  </span>
                  <span className="text-gray-600" data-testid="response-timing">
                    {" "}{responseTimingText(r)}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <BnPosteriorList nodes={teacherReport.modelSummary?.BayesianNetwork} />

          {teacherReport.modelSummary?.IRT && (
            <div data-testid="teacher-irt">
              <h4 className="font-semibold">IRT</h4>
              <p className="text-gray-700">
                Theta: {teacherReport.modelSummary.IRT.theta}
                {teacherReport.modelSummary.IRT.level ? ` (${teacherReport.modelSummary.IRT.level})` : ""}
                <ReportLevelMeta row={teacherReport.modelSummary.IRT} />
              </p>
              <ReportClaims row={teacherReport.modelSummary.IRT} className="text-sm text-gray-700" />
            </div>
          )}

          <div>
            <h4 className="font-semibold">Model Summary</h4>
            <pre className="bg-gray-100 p-2 rounded text-xs overflow-auto">{JSON.stringify(teacherReport.modelSummary, null, 2)}</pre>
          </div>

          {teacherReport.studentModelRecords?.length > 0 && (
            <div data-testid="teacher-student-model-records">
              <h4 className="font-semibold">Across occasions</h4>
              {teacherReport.studentModelRecords.map((record) => (
                <RecordCard key={record.id} record={record} />
              ))}
            </div>
          )}

          <div>
            <h4 className="font-semibold">Recommendations</h4>
            <ul className="list-disc ml-5 text-sm">
              {(teacherReport.recommendations?.individualLevel || []).map((r, i) => <li key={i}>{r}</li>)}
              {(teacherReport.recommendations?.groupLevel || []).map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          </div>
        </div>
      )}

      {tab === "raw" && report && (
        <div>
          {Array.isArray(report.responses) && report.responses.length > 0 && (
            <div className="mb-4" data-testid="report-responses">
              <h3 className="font-semibold mb-2">Responses</h3>
              <ul className="space-y-1 text-sm">
                {report.responses.map((row, i) => (
                  <li key={`${row.itemId || "item"}-${i}`}>
                    Item: <strong>{row.itemId || "—"}</strong>
                    {" · "}Option: <strong>{row.option || "—"}</strong>
                    {" · "}Activated: <strong>{row.activated == null ? "null" : String(row.activated)}</strong>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <h3 className="font-semibold mb-2">Raw Report JSON</h3>
          <pre className="ecd-raw">{JSON.stringify(report, null, 2)}</pre>
        </div>
      )}
      </div>
    </div>
  );
}
