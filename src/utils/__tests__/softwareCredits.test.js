import { describe, expect, it } from "vitest";
import { ensureReportCreditsHtml, formatSoftwareCredits } from "../softwareCredits.js";

describe("formatSoftwareCredits", () => {
  it("joins R version, citation, package names, and package citations", () => {
    const text = formatSoftwareCredits({
      rVersion: "R version 4.4.1",
      r: "R Core Team (2024). R: A language and environment for statistical computing.",
      packageNames: ["TAM", "ggplot2"],
      packages: ["Robitzsch, A. TAM.", "Wickham, H. ggplot2."],
    });
    expect(text).toMatch(/Packages used to generate this report: TAM, ggplot2/);
    expect(text).toMatch(/R version 4.4.1/);
    expect(text).toMatch(/R Core Team/);
    expect(text).toMatch(/ggplot2/);
  });

  it("falls back to the engine string when credits are missing", () => {
    expect(formatSoftwareCredits(null, { packageVersion: "TAM 4.3.25" })).toMatch(/TAM 4.3.25/);
    expect(formatSoftwareCredits(null)).toBe("");
  });

  it("injects a credits section into HTML that omitted it", () => {
    const html = ensureReportCreditsHtml(
      "<main class='report'><h1>CTT</h1><footer class='colophon'>bureau</footer></main>",
      { rVersion: "R version 4.4.1", packageNames: ["TAM"], packages: ["Robitzsch TAM"] },
      "TAM 4.3.25"
    );
    expect(html).toMatch(/id="credits"/);
    expect(html).toMatch(/Packages used to generate this report: TAM/);
    expect(html).toMatch(/<footer class="colophon"/);
  });

  it("does not duplicate credits already in the HTML", () => {
    const src = "<main><section id='credits'><h2>Software and packages</h2></section></main>";
    expect(ensureReportCreditsHtml(src, { rVersion: "R version 4.4.1" })).toBe(src);
  });
});
