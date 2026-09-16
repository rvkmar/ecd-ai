// DINAConfigPanel.jsx
// 🧠 Enterprise ECD — Diagnostic (DINA / G-DINA) Configuration Panel
// ---------------------------------------------------------------
// D53. UI change specification §2.2: "the Evidence Wizard surface
// deliberately left untouched since D18."
//
// WHAT THIS PANEL OWNS, AND WHAT IT DELIBERATELY DOES NOT
//
// It owns exactly one writable field: `structureConfig.qMatrixId`. That
// is the whole of the author's decision here. Everything else on this
// panel is DERIVED from the bound Q-matrix and rendered read-only, which
// is §4 rule 4 ("two controls must never write one field") applied
// literally: the attribute list is the Q-matrix's `attributeIds`, and the
// place to change it is the Q-matrix editor. A second editable copy here
// would be two controls writing one field, and the copy that lost would
// be the one the scoring engine reads.
//
// IT DOES NOT RE-IMPLEMENT THE SERVER'S RULE. schema.js (~line 1049)
// already refuses a Q-matrix whose attributes are not all binary Student
// Model Variables, with a message naming the offending SMV and its type.
// This panel scopes its Combobox to the evidence model's own competency
// model -- a scoping decision, not a validity rule -- and lets that
// refusal surface on confirm. Spec rule 6: "the UI surfaces server
// messages; it does not re-implement server rules." Re-deriving the
// binary check here is how the five broken mirrors happened.
//
// THE TWO BINARIES. The picker that offers this family at all gates on
// the COMPETENCY's `variableType === "binary"` (schema.js:1386). The
// Q-matrix's columns are the competency MODEL's binary `smVariables`.
// Different layers, same word. This panel reads the second and never
// touches the first.

import React, { useMemo } from "react";
import { AlertTriangle, Info } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Combobox } from "@/components/ui/combobox";
import { useQMatrixModels } from "@/api/queries/qMatrixModels";
import { psychologicalPerspectiveLabel } from "@/utils/ecdVocabulary";

import { useEvidenceWizardContext } from "../../EvidenceWizardContext";

/**
 * The panel proper: pure, and therefore the half that can be exercised in
 * Storybook and reasoned about without a query client. Split out for that
 * reason and no other -- it mirrors D51's own division of labour, where
 * QMatrixGrid is "deliberately dumb/presentational" and QMatrixEditor holds
 * the state. The container below is six lines and does nothing but fetch.
 */
export function DINAConfigPanelView({
  model,
  competencyModel,
  qMatrices = [],
  isLoading = false,
  onChange,
  locked,
}) {
  const selectedCompetencyModel = competencyModel;
  const competencyModelId = selectedCompetencyModel?.id;

  const config = model.structureConfig || {};
  const qMatrixId = config.qMatrixId || "";

  const boundQMatrix = useMemo(
    () => qMatrices.find((q) => q.id === qMatrixId) || null,
    [qMatrices, qMatrixId]
  );

  /* =====================================================
     ATTRIBUTE BINDINGS (DERIVED, READ-ONLY)
  ===================================================== */

  const attributeRows = useMemo(() => {
    if (!boundQMatrix) return [];

    const smvById = new Map(
      (selectedCompetencyModel?.smVariables || []).map((v) => [v.id, v])
    );

    return (boundQMatrix.attributeIds || []).map((attrId) => {
      const smv = smvById.get(attrId);
      const itemCount = new Set(
        (boundQMatrix.entries || [])
          .filter((e) => e.attributeId === attrId)
          .map((e) => e.itemId)
      ).size;

      return {
        id: attrId,
        label: smv?.label || smv?.name || attrId,
        // Shown rather than filtered: an attribute that is no longer a
        // binary SMV is precisely what the server will refuse, and an
        // author needs to see WHICH one before they can fix it.
        type: smv?.type || "unknown",
        itemCount,
      };
    });
  }, [boundQMatrix, selectedCompetencyModel]);

  /* =====================================================
     COHERENCE ADVISORY (UI SPEC §2.2)
     -----------------------------------------------------
     "if the Competency Model's psychologicalPerspective is trait-based
     and a diagnostic model is selected, show the advisory... Advisory,
     not blocking, until W30 makes it a modelled rule."

     The vocabulary states the pairing itself: `trait` is "the classical
     IRT/CTT view", `information_processing` is "the usual fit for
     DINA/G-DINA". So this reads the declared perspective rather than
     inventing a judgement about it, and it stays silent when no
     perspective is declared -- an absent field is not a contradiction.
  ===================================================== */

  const perspective = selectedCompetencyModel?.psychologicalPerspective;
  const perspectiveConflict = perspective === "trait";

  /* =====================================================
     RENDER
  ===================================================== */

  const options = useMemo(
    () =>
      qMatrices.map((q) => ({
        value: q.id,
        label: `${q.name} (${(q.attributeIds || []).length} attributes, ${q.status})`,
      })),
    [qMatrices]
  );

  return (
    <div className="space-y-6">
      {/* ---------- Q-matrix binding ---------- */}
      <section className="space-y-2">
        <h4 className="text-label font-medium text-slate-700">Q-matrix</h4>
        <p className="text-caption text-slate-500">
          Which attributes each item measures. A {model.type === "gdina" ? "G-DINA" : "DINA"} model
          is defined over a Q-matrix — it has nothing to classify without one.
        </p>

        {!competencyModelId ? (
          <p className="text-caption text-amber-700">
            This Evidence Model has no competency selected yet, so there is no competency model
            whose Q-matrices could be offered. Choose a competency in Step 1.
          </p>
        ) : isLoading ? (
          <p className="text-caption text-slate-500">Loading Q-matrices…</p>
        ) : qMatrices.length === 0 ? (
          // §4 rule 3: a message must say what to do.
          <p className="text-caption text-amber-700">
            No Q-matrix exists for{" "}
            <span className="font-medium">{selectedCompetencyModel?.name}</span> yet. An
            administrator builds one in the Diagnostic design editor, over this model&apos;s binary Student
            Model Variables; this panel can bind one once it exists.
          </p>
        ) : (
          <Combobox
            options={options}
            value={qMatrixId}
            onValueChange={(value) => onChange({ ...config, qMatrixId: value })}
            placeholder="Select a Q-matrix…"
            searchPlaceholder="Search Q-matrices…"
            emptyText="No Q-matrix matches."
            disabled={locked}
          />
        )}
      </section>

      {/* ---------- Coherence advisory ---------- */}
      {perspectiveConflict && (
        <div
          role="note"
          className="flex gap-3 rounded-md border border-amber-300 bg-amber-50 p-3"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
          <div className="text-caption text-amber-800">
            <span className="font-medium">
              This competency model declares a {psychologicalPerspectiveLabel(perspective)}{" "}
              perspective.
            </span>{" "}
            A trait perspective describes competence as a continuous latent trait, which a
            diagnostic model does not estimate — it classifies into discrete attribute mastery
            instead. This is advisory, not blocking: change the perspective on the competency model
            if the design really is diagnostic, or choose an IRT or Rasch model if it really is a
            trait.
          </div>
        </div>
      )}

      {/* ---------- Attribute bindings (read-only) ---------- */}
      {boundQMatrix && (
        <section className="space-y-2">
          <h4 className="text-label font-medium text-slate-700">Attributes</h4>
          <p className="text-caption text-slate-500">
            Derived from the bound Q-matrix. Renaming or re-scoping an attribute is a Q-matrix
            edit, not an Evidence Model edit.
          </p>

          <div className="overflow-x-auto rounded-md border border-slate-200">
            <table className="min-w-full text-caption">
              <caption className="sr-only">
                Attributes declared by the bound Q-matrix, read-only
              </caption>
              <thead>
                <tr className="bg-slate-50 text-left text-slate-600">
                  <th scope="col" className="px-4 py-2">
                    Attribute
                  </th>
                  <th scope="col" className="px-4 py-2">
                    Type
                  </th>
                  <th scope="col" className="px-4 py-2">
                    Items requiring it
                  </th>
                </tr>
              </thead>
              <tbody>
                {attributeRows.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100">
                    <th scope="row" className="px-4 py-2 text-left font-medium text-slate-700">
                      {row.label}
                    </th>
                    <td className="px-4 py-2">
                      {/* Severity is carried by the word as well as the colour --
                          §5's "never by colour alone". */}
                      <Badge variant={row.type === "binary" ? "secondary" : "destructive"}>
                        {row.type}
                      </Badge>
                    </td>
                    <td className="px-4 py-2">{row.itemCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ---------- Attribute ordering (read-only note) ---------- */}
      {boundQMatrix && (
        <section className="space-y-1">
          <h4 className="text-label font-medium text-slate-700">Attribute-pattern ordering</h4>
          <p className="text-caption text-slate-500">
            Mastery patterns are ordered <span className="font-medium">graded-lexicographically</span>{" "}
            — by how many attributes are mastered first, then lexicographically within each count.
            This is resolved and fixed (D37); it is shown because a G-DINA probability table is read
            positionally, and it is not configurable because changing it would silently reinterpret
            every parameter set ever calibrated against this model.
          </p>
        </section>
      )}

      {/* ---------- Pilot parameters ---------- */}
      <div className="flex gap-3 rounded-md border border-slate-200 bg-slate-50 p-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
        <div className="text-caption text-slate-600">
          <span className="font-medium">Slip and guess values are not authorable yet.</span> An IRT
          item carries pilot parameters on the item itself; there is no equivalent field for a
          diagnostic item, so a diagnostic model scores only against a calibrated parameter set. The
          model can still be authored and confirmed now — it cannot yet score on pilot values, and
          the accumulator says so rather than guessing.
        </div>
      </div>
    </div>
  );
}

/**
 * The container. The server honours ?competencyModelId= directly
 * (qMatrixModelsRoutes.js:50), so the scoping happens at the source rather
 * than by fetching everything and filtering here.
 */
export default function DINAConfigPanel(props) {
  const { selectedCompetencyModel } = useEvidenceWizardContext();
  const competencyModelId = selectedCompetencyModel?.id;

  const { data: qMatrices = [], isLoading } = useQMatrixModels(competencyModelId, {
    enabled: Boolean(competencyModelId),
  });

  return (
    <DINAConfigPanelView
      {...props}
      competencyModel={selectedCompetencyModel}
      qMatrices={qMatrices}
      isLoading={isLoading}
    />
  );
}
