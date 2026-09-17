// D82 — sortable item-analysis table with actionable advisory flags.

import { useMemo, useState } from "react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";

function formatNum(n, digits = 3) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

function compare(a, b, key, dir) {
  const av = a[key];
  const bv = b[key];
  let cmp = 0;
  if (key === "itemId") {
    cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
  } else if (key === "flagCount") {
    cmp = (a.flags?.length || 0) - (b.flags?.length || 0);
  } else {
    const an = typeof av === "number" ? av : Number.NEGATIVE_INFINITY;
    const bn = typeof bv === "number" ? bv : Number.NEGATIVE_INFINITY;
    cmp = an - bn;
  }
  return dir === "desc" ? -cmp : cmp;
}

export default function ItemAnalysisTable({ rows = [] }) {
  const [sortKey, setSortKey] = useState("itemId");
  const [sortDir, setSortDir] = useState("asc");

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => compare(a, b, sortKey, sortDir));
  }, [rows, sortKey, sortDir]);

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "itemId" ? "asc" : "desc");
    }
  };

  const sortButton = (key, label) => (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-auto px-1 py-0 font-medium"
      onClick={() => toggleSort(key)}
      aria-label={`Sort by ${label}`}
    >
      {label}
      {sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
    </Button>
  );

  if (!rows.length) {
    return (
      <p className="text-sm text-muted-foreground">
        This artefact has no item parameters to display.
      </p>
    );
  }

  return (
    <div className="space-y-3" data-testid="item-analysis-table">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{sortButton("itemId", "Item")}</TableHead>
            <TableHead>{sortButton("pValue", "p-value")}</TableHead>
            <TableHead>{sortButton("pointBiserial", "Point-biserial")}</TableHead>
            <TableHead>{sortButton("n", "n")}</TableHead>
            <TableHead>Distractors</TableHead>
            <TableHead>{sortButton("flagCount", "Flags")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((row) => (
            <TableRow key={row.itemId}>
              <TableCell className="font-mono text-2xs">{row.itemId}</TableCell>
              <TableCell>{formatNum(row.pValue)}</TableCell>
              <TableCell>{formatNum(row.pointBiserial)}</TableCell>
              <TableCell>{row.n ?? "—"}</TableCell>
              <TableCell className="text-caption text-muted-foreground">
                {row.distractors == null
                  ? "null (dichotomous / none reported)"
                  : Array.isArray(row.distractors)
                    ? `${row.distractors.length} options`
                    : typeof row.distractors === "object"
                      ? `${Object.keys(row.distractors).length} options`
                      : String(row.distractors)}
              </TableCell>
              <TableCell>
                {row.flags?.length ? (
                  <ul className="max-w-md list-disc space-y-1 pl-4 text-caption text-amber-800 dark:text-amber-200">
                    {row.flags.map((f) => (
                      <li key={f.code} data-testid={`flag-${row.itemId}-${f.code}`}>
                        <span className="font-medium">[{f.code}]</span> {f.message}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-caption text-muted-foreground">None</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
