import { formatSoftwareCredits } from "@/utils/softwareCredits";

export default function SoftwareCredits({ credits, packageVersion, testId }) {
  const text = formatSoftwareCredits(credits, { packageVersion });
  if (!text) return null;
  return (
    <section className="mt-4 space-y-2" data-testid={testId}>
      <h3 className="text-sm font-semibold tracking-tight">Software and packages</h3>
      <p className="text-sm text-muted-foreground">
        This report was produced by the ECD R bureau. It is not Iteman or Xcalibre software.
      </p>
      <pre className="overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-3 text-caption text-muted-foreground">
        {text}
      </pre>
    </section>
  );
}
