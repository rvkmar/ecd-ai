import React, { useEffect, useState } from "react";
import { usePolicies } from "../../api/queries/policies";
import { useAuth } from "../../auth/AuthProvider";
import { apiFetch } from "../../api/apiClient";
import { can } from "../../config/rolePermissions";
import { measurementStopHeading, measurementStopDetails } from "./measurementStop";
import { assemblyProgressLine } from "../../utils/assemblyConstraints";
import AttributeProfileList from "./AttributeProfileList";

function formatProbability(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "unknown";
  return `${Math.round(value * 1000) / 10}%`;
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
              {distribution ? <span className="text-gray-600"> {distribution}</span> : null}
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

  return (
    <div className="p-4 border rounded bg-white">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Session Report: {sessionId}</h2>
        {onClose && (
          <button onClick={onClose} className="px-3 py-1 bg-gray-300 rounded hover:bg-gray-400">Close</button>
        )}
      </div>

      {(stopped || attributeProfile.length > 0) && (
        <div className="mb-4 p-3 border rounded bg-green-50" data-testid="report-header-measurement">
          {stopped ? (
            <>
              <p className="font-medium">{measurementStopHeading(stopped)}</p>
              {stopped.reason && (
                <p className="text-sm text-gray-700 mt-1">{stopped.reason}</p>
              )}
            </>
          ) : (
            <p className="font-medium">Attribute profile</p>
          )}
          <AttributeProfileList attributes={attributeProfile.length ? attributeProfile : stopDetails} />
        </div>
      )}

      {(report?.student || teacherReport?.studentId) && (
        <div className="mb-4 text-sm text-gray-700" data-testid="report-student">
          <div>
            Student id: <strong>{report?.student?.id || teacherReport?.studentId}</strong>
          </div>
          <div>
            Student name: <strong>{report?.student?.name || teacherReport?.studentName || "—"}</strong>
          </div>
        </div>
      )}

      {Array.isArray(report?.responses) && report.responses.length > 0 && (
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

      <div className="mb-4 flex space-x-2">
        <button
          className={`px-3 py-1 rounded ${tab === "learner" ? "bg-purple-600 text-white" : "bg-gray-200 hover:bg-gray-300"}`}
          onClick={() => setTab("learner")}
        >
          Learner Feedback
        </button>
        {canViewTeacherReports && (
          <button
            className={`px-3 py-1 rounded ${tab === "teacher" ? "bg-green-600 text-white" : "bg-gray-200 hover:bg-gray-300"}`}
            onClick={() => setTab("teacher")}
          >
            Teacher Report
          </button>
        )}
        <button
          className={`px-3 py-1 rounded ${tab === "raw" ? "bg-blue-600 text-white" : "bg-gray-200 hover:bg-gray-300"}`}
          onClick={() => setTab("raw")}
        >
          Raw JSON
        </button>
      </div>

      {tab === "learner" && learnerFeedback && (
        <div className="space-y-3">
          <h3 className="font-semibold">Summary</h3>
          <p className="text-gray-700">Level: {learnerFeedback.summary?.level}</p>
          <p className="text-gray-700">{learnerFeedback.summary?.message}</p>

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
        </div>
      )}

      {tab === "teacher" && canViewTeacherReports && teacherReport && (
        <div className="space-y-3">
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

          <div>
            <h4 className="font-semibold">Responses</h4>
            <ul className="list-disc ml-5 text-sm">
              {teacherReport.responses?.map((r, i) => (
                <li key={i}>
                  Activity {r.taskId}: {r.rawAnswer || r.rubricLevel || r.scoredValue || "-"}{" "}
                  <span className="text-gray-500 text-xs">
                    [C: {r.competencyId || "?"}, E: {r.evidenceId || "?"}]
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <BnPosteriorList nodes={teacherReport.modelSummary?.BayesianNetwork} />

          <div>
            <h4 className="font-semibold">Model Summary</h4>
            <pre className="bg-gray-100 p-2 rounded text-xs overflow-auto">{JSON.stringify(teacherReport.modelSummary, null, 2)}</pre>
          </div>

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
          <h3 className="font-semibold mb-2">Raw Report JSON</h3>
          <pre className="bg-gray-100 p-2 rounded text-xs overflow-auto max-h-96">{JSON.stringify(report, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
