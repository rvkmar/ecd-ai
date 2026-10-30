import React from "react";
import { ReportClaims, ReportLevelMeta } from "../reports/ReportLevelBits";

// D59: the attribute-profile list shared by the report header, the
// learner view, and the teacher view. Copy matches the D58 player
// ending screen so a classification is named the same way everywhere.

export default function AttributeProfileList({ attributes }) {
  if (!attributes?.length) return null;
  return (
    <ul className="mt-2 text-sm text-gray-700 list-disc ml-5">
      {attributes.map((t) => (
        <li key={t.smvId || t.classification}>
          {t.smvId}
          {t.classification ? `: ${t.classification}` : ""}
          {Number.isFinite(t.expectedClassificationAccuracy)
            ? ` (confidence ${t.expectedClassificationAccuracy.toFixed(2)})`
            : ""}
          {Number.isFinite(t.requiredSEM)
            ? ` (SEM ${t.precision ?? "—"} ≤ ${t.requiredSEM})`
            : ""}
          {t.level ? (
            <span>
              {" "}
              Level {t.level}
              <ReportLevelMeta row={t} />
            </span>
          ) : (
            <ReportLevelMeta row={t} />
          )}
          <ReportClaims row={t} />
        </li>
      ))}
    </ul>
  );
}
