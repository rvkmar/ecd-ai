// Shared formatter for R bureau citations (payload.credits from ingest).

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function formatSoftwareCredits(credits, { packageVersion } = {}) {
  if (!credits || typeof credits !== "object") {
    if (packageVersion) {
      return [
        "This report was produced by the ECD R bureau.",
        `Engine: ${packageVersion}`,
      ].join("\n\n");
    }
    return "";
  }
  const names = (Array.isArray(credits.packageNames) ? credits.packageNames : [])
    .map((n) => (typeof n === "string" ? n.trim() : ""))
    .filter(Boolean);
  const used = names.length
    ? `Packages used to generate this report: ${names.join(", ")}.`
    : "";
  const packageLines = Array.isArray(credits.packages)
    ? credits.packages.filter((p) => typeof p === "string" && p.trim())
    : [];
  return [used, credits.rVersion, credits.r, ...packageLines].filter(Boolean).join("\n\n");
}

export function creditsSectionHtml(credits, packageVersion) {
  const text = formatSoftwareCredits(credits, { packageVersion });
  if (!text) return "";
  return `<section class="credits-block" id="credits"><h2>Software and packages</h2><p class="note">This report was produced by the ECD R bureau. It is not Iteman or Xcalibre software.</p><pre class="credits">${esc(
    text
  )}</pre></section>`;
}

export function ensureReportCreditsHtml(html, credits, packageVersion) {
  if (typeof html !== "string" || !html.trim()) return html;
  if (/id\s*=\s*['"]credits['"]/i.test(html) || /Software and packages/i.test(html)) {
    return html;
  }
  const block = creditsSectionHtml(credits, packageVersion);
  if (!block) return html;
  if (/<footer class=['"]colophon['"]/i.test(html)) {
    return html.replace(/<footer class=['"]colophon['"]/i, `${block}<footer class="colophon"`);
  }
  if (/<\/main>/i.test(html)) {
    return html.replace(/<\/main>/i, `${block}</main>`);
  }
  return `${html}${block}`;
}
