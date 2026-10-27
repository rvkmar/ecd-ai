function formatNum(n, digits = 3) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

function scalarB(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value) && typeof value[0] === "number") return value[0];
  return null;
}

const CURVE_KEYS = new Set(["theta", "information", "conditionalSEM"]);

function itemIdsFrom(parameters, standardErrors, itemFit) {
  const ids = new Set([
    ...Object.keys(parameters || {}),
    ...Object.keys(standardErrors || {}),
    ...Object.keys(itemFit || {}),
  ]);
  return [...ids].filter((id) => {
    if (CURVE_KEYS.has(id)) return false;
    const p = parameters?.[id];
    if (p && typeof p === "object" && !Array.isArray(p)) {
      return "a" in p || "b" in p || "c" in p;
    }
    return Boolean(standardErrors?.[id] || itemFit?.[id]);
  });
}

export function irtFitRows({ parameters, standardErrors, itemFit } = {}) {
  return itemIdsFrom(parameters, standardErrors, itemFit).map((itemId) => {
    const p = parameters?.[itemId] || {};
    const se = standardErrors?.[itemId] || {};
    const fit = itemFit?.[itemId] || {};
    return {
      itemId,
      a: typeof p.a === "number" ? p.a : null,
      seA: typeof se.a === "number" ? se.a : null,
      b: scalarB(p.b),
      seB: scalarB(se.b),
      c: typeof p.c === "number" ? p.c : null,
      seC: typeof se.c === "number" ? se.c : null,
      sx2: typeof fit.S_X2 === "number" ? fit.S_X2 : null,
      sx2p: typeof fit["p.S_X2"] === "number" ? fit["p.S_X2"] : null,
      infit: typeof fit.infit === "number" ? fit.infit : null,
      outfit: typeof fit.outfit === "number" ? fit.outfit : null,
    };
  });
}

export default function IrtFitTable({
  parameters,
  standardErrors,
  itemFit,
  empty = null,
}) {
  const rows = irtFitRows({ parameters, standardErrors, itemFit });
  if (!rows.length) return empty;
  return (
    <div className="overflow-x-auto" data-testid="irt-fit-table">
      <table className="w-full text-caption">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="pr-3">Item</th>
            <th className="pr-3">a</th>
            <th className="pr-3">SE(a)</th>
            <th className="pr-3">b</th>
            <th className="pr-3">SE(b)</th>
            <th className="pr-3">c</th>
            <th className="pr-3">SE(c)</th>
            <th className="pr-3">S-X2</th>
            <th className="pr-3">p</th>
            <th className="pr-3">infit</th>
            <th>outfit</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.itemId}>
              <td className="pr-3 font-mono">{row.itemId}</td>
              <td className="pr-3">{formatNum(row.a)}</td>
              <td className="pr-3">{formatNum(row.seA)}</td>
              <td className="pr-3">{formatNum(row.b)}</td>
              <td className="pr-3">{formatNum(row.seB)}</td>
              <td className="pr-3">{formatNum(row.c)}</td>
              <td className="pr-3">{formatNum(row.seC)}</td>
              <td className="pr-3">{formatNum(row.sx2)}</td>
              <td className="pr-3">{formatNum(row.sx2p, 4)}</td>
              <td className="pr-3">{formatNum(row.infit)}</td>
              <td>{formatNum(row.outfit)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
