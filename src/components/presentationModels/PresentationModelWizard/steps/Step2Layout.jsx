// steps/Step2Layout.jsx — D113 Step 2: item order, grouping, navigation.

import React from "react";
import { Combobox } from "@/components/ui/combobox";
import { usePresentationModelWizard } from "../PresentationModelWizardContext";
import {
  PRESENTATION_ITEM_ORDERS,
  PRESENTATION_GROUPINGS,
  PRESENTATION_NAVIGATIONS,
} from "@/utils/ecdVocabulary";

export default function Step2Layout() {
  const { draft, patchLayout } = usePresentationModelWizard();
  const locked = draft.locked;
  const layout = draft.layout || {};

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Layout</h2>
        <p className="mt-1 text-sm text-slate-500">
          How items are ordered, grouped, and paged. Required before review.
          SessionPlayer does not yet apply these values.
        </p>
      </div>

      <div>
        <label className="text-sm font-medium text-slate-600">Item order</label>
        <Combobox
          options={PRESENTATION_ITEM_ORDERS.map((o) => ({ value: o.value, label: o.label }))}
          value={layout.itemOrder}
          onValueChange={(itemOrder) => patchLayout({ itemOrder })}
          placeholder="Select item order…"
          disabled={locked}
        />
        <p className="mt-1 text-xs text-slate-400">
          {PRESENTATION_ITEM_ORDERS.find((o) => o.value === layout.itemOrder)?.hint}
        </p>
      </div>

      <div>
        <label className="text-sm font-medium text-slate-600">Grouping</label>
        <Combobox
          options={PRESENTATION_GROUPINGS.map((o) => ({ value: o.value, label: o.label }))}
          value={layout.grouping}
          onValueChange={(grouping) => patchLayout({ grouping })}
          placeholder="Select grouping…"
          disabled={locked}
        />
        <p className="mt-1 text-xs text-slate-400">
          Optional until a later player unit.{" "}
          {PRESENTATION_GROUPINGS.find((o) => o.value === layout.grouping)?.hint}
        </p>
      </div>

      <div>
        <label className="text-sm font-medium text-slate-600">Navigation</label>
        <Combobox
          options={PRESENTATION_NAVIGATIONS.map((o) => ({ value: o.value, label: o.label }))}
          value={layout.navigation}
          onValueChange={(navigation) => patchLayout({ navigation })}
          placeholder="Select navigation…"
          disabled={locked}
        />
        <p className="mt-1 text-xs text-slate-400">
          {PRESENTATION_NAVIGATIONS.find((o) => o.value === layout.navigation)?.hint}
        </p>
      </div>
    </div>
  );
}
