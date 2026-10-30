import React, { useEffect, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { apiFetch, apiErrorMessage } from "@/api/apiClient";
import { ReportClaims, ReportLevelMeta } from "./ReportLevelBits";

function formatStat(value) {
  if (!Number.isFinite(value)) return null;
  return String(Math.round(value * 1000) / 1000);
}

export default function ClassReport({ classId, onClose }) {
  const { auth } = useAuth() || {};
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!classId) return;
    setLoading(true);
    apiFetch(`/api/reports/teacher/class/${classId}`, {}, auth)
      .then((data) => setReport(data))
      .catch((err) => setError(apiErrorMessage(err, "Failed to fetch class report")))
      .finally(() => setLoading(false));
  }, [classId]);

  if (!classId) return null;
  if (loading) return <div className="p-4">Loading class report...</div>;
  if (error) return <div className="p-4 text-red-600">❌ {error}</div>;

  return (
    <div className="p-4 border rounded bg-white">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Class Report: {classId}</h2>
        {onClose && (
          <button
            onClick={onClose}
            className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300"
          >
            Close
          </button>
        )}
      </div>

      {report.summary?.IRT && (
        <div className="mb-4" data-testid="class-irt">
          <h3 className="font-semibold">IRT</h3>
          {report.summary.IRT.suppressed ? (
            <p className="text-sm text-gray-600">Class theta is withheld for a small class.</p>
          ) : (
            <p className="text-sm text-gray-700">
              Mean {formatStat(report.summary.IRT.mean)}
              {report.summary.IRT.level ? ` (${report.summary.IRT.level})` : ""}
              <ReportLevelMeta row={report.summary.IRT} />
            </p>
          )}
          <ReportClaims row={report.summary.IRT} className="text-sm text-gray-700" />
        </div>
      )}

      {report.summary?.BayesianNetwork && Object.keys(report.summary.BayesianNetwork).length > 0 && (
        <div className="mb-4" data-testid="class-bn">
          <h3 className="font-semibold">Bayesian network</h3>
          <ul className="text-sm text-gray-700 list-disc ml-5">
            {Object.entries(report.summary.BayesianNetwork).map(([node, row]) => (
              <li key={node}>
                <span className="font-medium">{node}</span>
                {row?.suppressed ? (
                  ": withheld for a small class"
                ) : (
                  <>
                    {Number.isFinite(row?.mean) ? `: ${formatStat(row.mean)}` : ""}
                    {row?.level ? ` (${row.level})` : ""}
                    <ReportLevelMeta row={row} />
                  </>
                )}
                <ReportClaims row={row} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Example summary */}
      {report.summary && (
        <div className="mb-4">
          <h3 className="font-semibold">Summary</h3>
          <p>Total Students: {report.summary.totalStudents}</p>
          <p>Completed Sessions: {report.summary.completedSessions}</p>
          <p>Average Mastery: {report.summary.avgMasteryLevel}</p>
        </div>
      )}

      {/* Student-level results */}
      {report.students && report.students.length > 0 ? (
        <div>
          <h3 className="font-semibold mb-2">Student Results</h3>
          <table className="w-full border text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="border px-2 py-1">Student</th>
                <th className="border px-2 py-1">Sessions</th>
                <th className="border px-2 py-1">Mastery</th>
              </tr>
            </thead>
            <tbody>
              {report.students.map((s) => (
                <tr key={s.id}>
                  <td className="border px-2 py-1">{s.name || s.id}</td>
                  <td className="border px-2 py-1">{s.completedSessions}</td>
                  <td className="border px-2 py-1">{s.masteryLevel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-gray-500">No student results yet</p>
      )}
    </div>
  );
}
