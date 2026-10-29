// Step6ItemMapping.jsx
// ------------------------------------------------------------
// Task Model Wizard — Step 6: Item ↔ Observable Mapping (readout)
// ------------------------------------------------------------
// D154: coverage is derived from confirmed items. This step does not
// author the map. Confirming an item updates the parent Task Model
// server-side, including when that model is locked.
// ------------------------------------------------------------

import { useMemo } from "react";
import { Check, Info } from "lucide-react";
import InfoTooltip from "../../../ui/InfoTooltip";

export default function Step6ItemMapping({
    draft,
    availableItems = [],
    observationLookup = {},
}) {
    const expectedObservations = draft.expectedObservations || [];
    const itemMappings = draft.itemMappings || [];

    const observables = useMemo(
        () =>
            expectedObservations.map((o) => ({
                observationId: o.observationId,
                evidenceModelId: o.evidenceModelId,
                required: o.required,
                label:
                    observationLookup[o.observationId]?.statement || o.observationId,
            })),
        [expectedObservations, observationLookup]
    );

    const itemById = useMemo(() => {
        const map = new Map((availableItems || []).map((item) => [item.id, item]));
        return map;
    }, [availableItems]);

    const mappedItems = useMemo(() => {
        const seen = [];
        const ids = new Set();
        for (const mapping of itemMappings) {
            if (!mapping?.itemId || ids.has(mapping.itemId)) continue;
            ids.add(mapping.itemId);
            seen.push(
                itemById.get(mapping.itemId) || {
                    id: mapping.itemId,
                    status: "confirmed",
                }
            );
        }
        return seen;
    }, [itemMappings, itemById]);

    const itemLabel = (item) => item.stem || item.name || item.id;

    const coverage = useMemo(
        () =>
            observables.map((obs) => ({
                ...obs,
                count: itemMappings.filter(
                    (m) => m.observationId === obs.observationId
                ).length,
            })),
        [observables, itemMappings]
    );

    const uncovered = coverage.filter((c) => c.count === 0);

    if (observables.length === 0) {
        return (
            <div className="space-y-6">
                <Header />
                <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm text-slate-600">
                    <Info size={16} strokeWidth={2.25} className="mt-0.5 shrink-0 text-slate-400" />
                    <span>
                        Target at least one observable in Step 3. Coverage appears here
                        after items that elicit those observables are confirmed.
                    </span>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <Header />

            {mappedItems.length === 0 ? (
                <p className="text-sm text-slate-500">
                    No confirmed items instantiate this Task Model yet. Author and
                    confirm items in the Item Bank — this map updates from those
                    records, not from ticks on this step.
                </p>
            ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-200 shadow-sm">
                    <table className="w-full border-collapse text-sm">
                        <thead className="bg-slate-50">
                            <tr>
                                <th className="sticky left-0 z-20 min-w-[260px] border-b border-slate-200 bg-slate-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                                    Observable
                                </th>
                                {mappedItems.map((item) => (
                                    <th
                                        key={item.id}
                                        className="border-b border-slate-200 px-4 py-3 text-center"
                                        title={itemLabel(item)}
                                    >
                                        <span className="mx-auto block max-w-[160px] truncate text-xs font-medium text-slate-700">
                                            {itemLabel(item)}
                                        </span>
                                        <span className="text-[11px] capitalize text-slate-400">
                                            {item.status}
                                        </span>
                                    </th>
                                ))}
                            </tr>
                        </thead>

                        <tbody className="divide-y divide-slate-100 bg-white">
                            {observables.map((obs) => (
                                <tr key={obs.observationId}>
                                    <td className="sticky left-0 z-10 min-w-[260px] bg-white px-4 py-3 text-slate-700">
                                        <span className="block">{obs.label}</span>
                                        {obs.required && (
                                            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                                                Required
                                            </span>
                                        )}
                                    </td>

                                    {mappedItems.map((item) => {
                                        const mapped = itemMappings.some(
                                            (m) =>
                                                m.observationId === obs.observationId &&
                                                m.itemId === item.id
                                        );

                                        return (
                                            <td key={item.id} className="px-4 py-3 text-center">
                                                {mapped ? (
                                                    <Check
                                                        size={16}
                                                        strokeWidth={2.25}
                                                        className="mx-auto text-emerald-700"
                                                        aria-label={`${itemLabel(item)} elicits ${obs.label}`}
                                                    />
                                                ) : (
                                                    <span className="text-slate-300" aria-hidden>
                                                        —
                                                    </span>
                                                )}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-800">
                    Observable Coverage
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                    {uncovered.length === 0
                        ? "Every declared observable has at least one confirmed item."
                        : `${uncovered.length} of ${coverage.length} observables have no confirmed item yet. Task Model confirmation does not wait for this.`}
                </p>

                <ul className="mt-4 space-y-2 text-sm">
                    {coverage.map((c) => (
                        <li
                            key={c.observationId}
                            className="flex items-start justify-between gap-4"
                        >
                            <span className="min-w-0 text-slate-700">{c.label}</span>
                            {c.count > 0 ? (
                                <span className="inline-flex shrink-0 items-center gap-1 text-emerald-700">
                                    <Check size={14} strokeWidth={2.25} />
                                    {c.count} item{c.count === 1 ? "" : "s"}
                                </span>
                            ) : (
                                <span className="shrink-0 text-amber-700">Not covered</span>
                            )}
                        </li>
                    ))}
                </ul>
            </section>
        </div>
    );
}

function Header() {
    return (
        <div>
            <h2 className="inline-flex items-center gap-1.5 text-lg font-semibold text-slate-900">
                Item – Observable Mapping
                <InfoTooltip content="Derived from items that instantiate this Task Model. Confirming an item writes the map; this step does not edit it." />
            </h2>
            <p className="mt-1 text-sm text-slate-500">
                Which confirmed items elicit which observables. Author items in the
                Item Bank; this table follows those records.
            </p>
        </div>
    );
}
