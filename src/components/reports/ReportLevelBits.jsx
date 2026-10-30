import React from "react";

function claimRows(row) {
  if (!row) return [];
  if (Array.isArray(row.claims) && row.claims.length) {
    return row.claims.filter((claim) => claim && claim.claimStatement);
  }
  if (row.claimStatement) return [{ claimStatement: row.claimStatement }];
  return [];
}

export function ReportClaims({ row, className }) {
  const rows = claimRows(row);
  if (!rows.length) return null;
  return (
    <div className={className} data-testid="report-claim">
      {rows.map((claim, index) => (
        <p key={claim.evidenceModelId || index}>Claim: {claim.claimStatement}</p>
      ))}
    </div>
  );
}

function formatStat(value) {
  return String(Math.round(value * 1000) / 1000);
}

/** Descriptor, SE or posterior SD, and the default-cut note. The level word stays with the caller. */
export function ReportLevelMeta({ row }) {
  if (!row) return null;
  const descriptor = row.levelText && row.levelText !== row.level ? row.levelText : null;
  const note = row.levelSource === "default" ? (row.levelNote || "default cut") : null;
  const se = Number.isFinite(row.standardError) ? row.standardError : null;
  const sd = Number.isFinite(row.posteriorSd) ? row.posteriorSd : null;
  if (!descriptor && !note && se == null && sd == null) return null;
  return (
    <span data-testid="report-level-meta">
      {descriptor ? ` ${descriptor}` : ""}
      {se != null ? ` SE ${formatStat(se)}` : ""}
      {sd != null ? ` SD ${formatStat(sd)}` : ""}
      {note ? <span data-testid="report-level-source"> {note}</span> : null}
    </span>
  );
}
