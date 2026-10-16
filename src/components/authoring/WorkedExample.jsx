// A finished record shown on an empty authoring screen. It is an example,
// not a wizard and not a saved row.

export default function WorkedExample({ title, lines, citedBy }) {
  return (
    <aside
      className="rounded-md border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
      aria-label="Worked example"
    >
      <p className="font-medium text-slate-900 dark:text-slate-100">{title}</p>
      <ul className="mt-2 list-disc space-y-1 pl-4">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p className="mt-2 text-slate-600 dark:text-slate-400">Cited later by {citedBy}.</p>
    </aside>
  );
}
