// CompetencyWizard/CompetencyWizardContext.jsx
// 🧠 Extreme Strict ECD — Competency Wizard Context (Enterprise Final)
// ✔ True dirty tracking
// ✔ Toast-only notifications
// ✔ Strict lifecycle enforcement
// ✔ Optimistic save state
// ✔ Clean confirm + clone callbacks
// ✔ Draft-step navigation guard (Step 3,5,6 require Save Draft)

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import toast from "react-hot-toast";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiErrorMessage } from "@/api/apiClient";
import { useAuth } from "@/auth/AuthProvider";
import {
  competencyModelsKey,
  competencyModelKey,
  competenciesKey,
  useCompetencyModels,
} from "@/api/queries/competencies";
import { computeStructuralAudit } from "./structuralAudit";
import { syncSmVariablesFromCompetencies } from "./smVariableSync";
import { PSYCHOLOGICAL_PERSPECTIVE_VALUES } from "@/utils/ecdVocabulary";

const CompetencyWizardContext = createContext(null);

export function useCompetencyWizard() {
  const ctx = useContext(CompetencyWizardContext);
  if (!ctx) {
    throw new Error(
      "useCompetencyWizard must be used inside CompetencyWizardProvider"
    );
  }
  return ctx;
}

export function CompetencyWizardProvider({
  modelId,
  onConfirmed,
  onCloned,
  children,
}) {
  const [model, setModel] = useState(null);
  const [competencies, setCompetencies] = useState([]);

  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const [confirmAck, setConfirmAck] = useState({
    acknowledgeSameAuthor: false,
    sameAuthorReason: "",
  });

  const { auth } = useAuth() || {};
  const queryClient = useQueryClient();

  // Full model list, needed by Step9Confirmation's VersionHistoryViewer to
  // build the draft/confirmed version lineage (a model's clones/parent).
  // Shares the same cached query every other consumer of the competency
  // models list already uses (CompetencyModelBuilderPanel, CompetencyTable,
  // CompetencyDashboard), so this doesn't add a redundant fetch.
  const { data: allModels = [] } = useCompetencyModels();

  /* =====================================================
     🔹 LOAD MODEL
  ===================================================== */
  useEffect(() => {
    async function loadModel() {
      if (!modelId) {
        setModel({
          name: "",
          description: "",
          measurementIntent: "",
          psychologicalPerspective: "",
          constructFramework: {},
          smVariables: [],
          status: "draft",
          locked: false,
        });
        setCompetencies([]);
        setIsDirty(false);
        setLoading(false);
        return;
      }

      try {
        const data = await apiFetch(`/api/competencies/models/${modelId}`, {}, auth);
        const loadedCompetencies = data.competencies || [];
        setCompetencies(loadedCompetencies);
        setModel({
          ...data,
          smVariables: syncSmVariablesFromCompetencies(
            loadedCompetencies,
            data.smVariables || []
          ),
        });
        setIsDirty(false);
      } catch {
        toast.error("Failed to load model.");
      } finally {
        setLoading(false);
      }
    }

    loadModel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelId]);

  /* =====================================================
     🔹 MARK DIRTY HELPER
  ===================================================== */
  function markDirty() {
    setIsDirty(true);
  }

  /* =====================================================
     🔹 MODEL FIELD UPDATES
  ===================================================== */
  function updateModelField(field, value) {
    if (model?.locked) return;
    setModel((prev) => ({ ...prev, [field]: value }));
    markDirty();
  }

  function setCompetenciesAndSync(nextCompetencies) {
    setCompetencies(nextCompetencies);
    setModel((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        smVariables: syncSmVariablesFromCompetencies(
          nextCompetencies,
          prev.smVariables || []
        ),
      };
    });
    markDirty();
  }

  function updateSmVariablePrior(smvId, priorDistribution) {
    if (model?.locked) return;
    setModel((prev) => ({
      ...prev,
      smVariables: (prev.smVariables || []).map((s) =>
        s.id === smvId ? { ...s, priorDistribution } : s
      ),
    }));
    markDirty();
  }

  function updateConstructFramework(field, value) {
    if (model?.locked) return;
    setModel((prev) => ({
      ...prev,
      constructFramework: {
        ...prev.constructFramework,
        [field]: value,
      },
    }));
    markDirty();
  }

  // Multi-field variant. Step 3's curricular-policy picker has to change
  // policyId, policyName, curricularGoalCodes, curricularGoals and
  // (optionally) reference as ONE atomic edit -- selecting a different
  // policy must clear the previous policy's goal selection in the same
  // commit, or a render can briefly observe policy A's id alongside
  // policy B's goals and render options that don't exist in either.
  function patchConstructFramework(patch) {
    if (model?.locked) return;
    setModel((prev) => ({
      ...prev,
      constructFramework: {
        ...prev.constructFramework,
        ...patch,
      },
    }));
    markDirty();
  }

  /* =====================================================
     🔹 COMPETENCY MANAGEMENT
  ===================================================== */
  function addCompetency() {
    if (model?.locked) return;

    if (
      model?.measurementIntent === "unidimensional" &&
      competencies.length >= 1
    ) {
      toast.error("Unidimensional models may contain only one competency.");
      return;
    }

    const tempId = `temp_${Date.now()}`;

    setCompetenciesAndSync([
      ...competencies,
      {
        id: tempId,
        name: "",
        description: "",
        variableType: "",
        states: [],
        scale: {},
        relationships: [],
        domain: "",
        strand: "",
        facet: "",
        modelId: model?.id || null,
      },
    ]);
  }

  function updateCompetency(id, updates) {
    if (model?.locked) return;
    setCompetenciesAndSync(
      competencies.map((c) => (c.id === id ? { ...c, ...updates } : c))
    );
  }

  function removeCompetency(id) {
    if (model?.locked) return;
    setCompetenciesAndSync(competencies.filter((c) => c.id !== id));
  }

  function addRelationship(sourceId, relationship) {
    setCompetencies((prev) =>
      prev.map((comp) =>
        comp.id === sourceId
          ? {
            ...comp,
            relationships: [
              ...(comp.relationships || []),
              relationship,
            ],
          }
          : comp
      )
    );
    markDirty();
  }

  function removeRelationship(sourceId, targetId, type) {
    setCompetencies((prev) =>
      prev.map((comp) =>
        comp.id === sourceId
          ? {
            ...comp,
            relationships: (comp.relationships || []).filter(
              (r) =>
                !(
                  r.targetCompetencyId === targetId && r.type === type
                )
            ),
          }
          : comp
      )
    );
    markDirty();
  }

  /* =====================================================
     🔹 STEP VALIDATION
  ===================================================== */
  const stepValidity = useMemo(() => {
    const validity = {};

    // Step 1's own form (Step1ModelIdentity.jsx) requires name >= 5 chars
    // AND a description >= 10 chars before it stops showing field errors.
    // This gate used to only check name.length > 3 and never checked
    // description at all, so Next could be clicked while Step 1's own
    // fields were still showing red validation errors -- the wizard
    // "wrapping up" past an incomplete step.
    validity[1] =
      model?.name?.trim().length >= 5 &&
      model?.description?.trim().length >= 10 &&
      PSYCHOLOGICAL_PERSPECTIVE_VALUES.includes(model?.psychologicalPerspective);
    validity[2] = ["unidimensional", "multidimensional"].includes(
      model?.measurementIntent
    );
    {
      const fw = model?.constructFramework || {};
      validity[3] =
        (fw.ungroundedWaiver === true &&
          typeof fw.ungroundedReason === "string" &&
          fw.ungroundedReason.trim().length >= 10) ||
        Boolean(
          fw.policyId &&
            Array.isArray(fw.curricularGoalCodes) &&
            fw.curricularGoalCodes.length > 0
        );
    }
    // The backend unconditionally rejects a competency without a
    // variableType (even on draft saves -- see schema.js's competencies
    // validation), but this used to only check count > 0. Adding a
    // competency and clicking Next without opening its card first (both
    // still possible on Step 4's own UI) silently failed the auto-save
    // with a raw "Competency must define variableType." toast instead of
    // being caught here before ever leaving the step.
    validity[4] =
      competencies.length > 0 && competencies.every((c) => c.variableType);
    validity[5] =
      competencies.every((c) => c.variableType) &&
      computeStructuralAudit({ model, competencies }).checks
        .find((c) => c.label.includes("structurally valid"))
        ?.passed !== false &&
      competencies.every((c) => {
        if (!c.variableType) return false;
        if (c.variableType === "binary") return c.states?.length === 2;
        if (c.variableType === "ordinal" || c.variableType === "categorical")
          return c.states?.length >= 2;
        if (c.variableType === "continuous")
          return (
            typeof c.scale?.min === "number" &&
            typeof c.scale?.max === "number" &&
            c.scale.min < c.scale.max
          );
        return false;
      });
    {
      const relCount = competencies.reduce(
        (n, c) => n + (c.relationships?.length || 0),
        0
      );
      validity[6] =
        model?.measurementIntent !== "multidimensional" || relCount >= 3;
    }
    validity[7] =
      competencies.length > 0 &&
      competencies.every(
        (c) => c.domain?.trim() && c.strand?.trim() && c.facet?.trim()
      );
    // Step 8's StructuralAuditChecklist visually promises "Final
    // confirmation will be blocked if any rule fails," but this used to
    // only check competencies.length > 0 -- every other row on that
    // checklist (name/description length, measurement intent, per-
    // competency structural validity, self-references, prerequisite
    // cycles) could be red and Next/Lock & Confirm still proceeded. Now
    // shares the exact same computeStructuralAudit() the checklist
    // renders, so the gate and the display can never disagree.
    validity[8] = computeStructuralAudit({ model, competencies }).allPassed;

    return validity;
  }, [model, competencies]);

  function canProceed(step) {
    return stepValidity[step] ?? true;
  }

  /* =====================================================
     🔹 SAVE DRAFT
     Silent by design -- there is no manual "Save Draft" button
     anymore. This runs automatically (see CompetencyWizard.jsx's
     goNext/handleLockAndConfirm) whenever the user advances past
     step 1 or confirms with unsaved changes. Returns true/false so
     callers can decide whether to proceed with navigation.
  ===================================================== */
  async function saveDraft() {
    if (!model) return false;

    if (
      !model.measurementIntent ||
      !["unidimensional", "multidimensional"].includes(
        model.measurementIntent
      )
    ) {
      toast.error(
        "Measurement Intent must be defined (Step 2) before saving."
      );
      return false;
    }

    setSaving(true);

    try {
      let savedModel = model;

      const payload = {
        ...model,
        smVariables: syncSmVariablesFromCompetencies(
          competencies,
          model.smVariables || []
        ),
        status: model.status === "reviewed" ? "reviewed" : "draft",
      };

      if (!model.id) {
        try {
          savedModel = await apiFetch("/api/competencies/models", {
            method: "POST",
            body: JSON.stringify(payload),
          }, auth);
        } catch (err) {
          throw new Error(apiErrorMessage(err, "Model create failed"));
        }
        setModel(savedModel);
      } else {
        try {
          savedModel = await apiFetch(`/api/competencies/models/${model.id}`, {
            method: "PUT",
            body: JSON.stringify(payload),
          }, auth);
        } catch (err) {
          throw new Error(apiErrorMessage(err, "Model update failed"));
        }
        setModel(savedModel);
      }

      const existingData = await apiFetch(
        `/api/competencies/models/${savedModel.id}`,
        {},
        auth
      );
      const dbCompetencies = existingData.competencies || [];
      const dbMap = new Map(dbCompetencies.map((c) => [c.id, c]));

      const synced = [];

      for (const comp of competencies) {
        if (comp.id && dbMap.has(comp.id)) {
          try {
            const updated = await apiFetch(`/api/competencies/${comp.id}`, {
              method: "PUT",
              body: JSON.stringify(comp),
            }, auth);
            synced.push(updated);
          } catch (err) {
            throw new Error(apiErrorMessage(err, "Competency update failed"));
          }
        } else {
          const { id, ...rest } = comp;
          try {
            const created = await apiFetch("/api/competencies", {
              method: "POST",
              body: JSON.stringify({
                ...rest,
                modelId: savedModel.id,
                measurementIntent: savedModel.measurementIntent,
                status: "draft",
              }),
            }, auth);
            synced.push(created);
          } catch (err) {
            throw new Error(apiErrorMessage(err, "Competency create failed"));
          }
        }
      }

      for (const dbComp of dbCompetencies) {
        if (!competencies.some((c) => c.id === dbComp.id)) {
          await apiFetch(`/api/competencies/${dbComp.id}`, { method: "DELETE" }, auth);
        }
      }

      const alignedSmVariables = syncSmVariablesFromCompetencies(
        synced,
        payload.smVariables || []
      );
      try {
        savedModel = await apiFetch(`/api/competencies/models/${savedModel.id}`, {
          method: "PUT",
          body: JSON.stringify({
            ...savedModel,
            ...payload,
            smVariables: alignedSmVariables,
            status: savedModel.status === "reviewed" ? "reviewed" : "draft",
          }),
        }, auth);
      } catch (err) {
        throw new Error(apiErrorMessage(err, "Student Model SMV sync failed"));
      }

      setCompetencies(synced);
      setModel({ ...savedModel, smVariables: alignedSmVariables });
      setIsDirty(false);

      // Refresh every cache that reflects this model/its competencies --
      // the model list (CompetencyModelBuilder), this specific model
      // (re-opening the wizard), and the flat competencies list read by
      // EvidenceModelList/TaskModelList/TaskModelBuilder/StepIdentity/
      // TaskDetails.
      queryClient.invalidateQueries({ queryKey: competencyModelsKey });
      queryClient.invalidateQueries({ queryKey: competencyModelKey(savedModel.id) });
      queryClient.invalidateQueries({ queryKey: competenciesKey });

      return true;
    } catch (err) {
      toast.error(err.message || "Save failed.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  /* =====================================================
     🔹 SAVE & SUBMIT FOR REVIEW (final step, draft only)
     Promotes draft -> reviewed via the lifecycle route. This is what
     turns the model list's Edit button into Review; the reopened
     wizard's final step then offers Lock & Confirm instead of Save.
     Confirmation is NOT reachable here -- POST .../confirm owns it.
  ===================================================== */
  async function saveAndReview() {
    if (!model?.id) return;

    const toastId = toast.loading("Saving model...");

    try {
      const ok = await saveDraft();
      if (!ok) {
        toast.error("Save failed before review.", { id: toastId });
        return;
      }

      const saved = await apiFetch(
        `/api/competencies/models/${model.id}/lifecycle`,
        { method: "PATCH", body: JSON.stringify({ nextStatus: "reviewed" }) },
        auth
      );

      setModel(saved);
      setIsDirty(false);

      queryClient.invalidateQueries({ queryKey: competencyModelsKey });
      queryClient.invalidateQueries({ queryKey: competencyModelKey(model.id) });

      toast.success("Model saved and ready for review.", { id: toastId });

      if (onConfirmed) onConfirmed(saved);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Save failed."), { id: toastId });
    }
  }

  /* =====================================================
     🔹 CONFIRM MODEL
  ===================================================== */
  async function confirmModel() {
    if (!model?.id) return;

    const toastId = toast.loading("Confirming model...");

    try {
      const confirmed = await apiFetch(
        `/api/competencies/models/${model.id}/confirm`,
        {
          method: "POST",
          body: JSON.stringify({
            acknowledgeSameAuthor: confirmAck.acknowledgeSameAuthor === true,
            sameAuthorReason: confirmAck.sameAuthorReason || "",
          }),
        },
        auth
      );

      setModel(confirmed);
      setIsDirty(false);

      queryClient.invalidateQueries({ queryKey: competencyModelsKey });
      queryClient.invalidateQueries({ queryKey: competencyModelKey(model.id) });

      toast.success("Model confirmed successfully.", { id: toastId });

      if (onConfirmed) onConfirmed(confirmed);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Confirmation failed."), { id: toastId });
    }
  }

  /* =====================================================
     🔹 RETURN TO DRAFT (reviewer rejection)
     The reviewed -> draft transition the lifecycle matrix has always
     declared, with no control anywhere in the product to reach it -- a
     reviewer had no way to send a model back for changes short of
     editing the database directly.
  ===================================================== */
  async function returnToDraft() {
    if (!model?.id) return;

    const toastId = toast.loading("Returning model to draft...");

    try {
      const saved = await apiFetch(
        `/api/competencies/models/${model.id}/lifecycle`,
        { method: "PATCH", body: JSON.stringify({ nextStatus: "draft" }) },
        auth
      );

      setModel(saved);
      setIsDirty(false);

      queryClient.invalidateQueries({ queryKey: competencyModelsKey });
      queryClient.invalidateQueries({ queryKey: competencyModelKey(model.id) });

      toast.success("Model returned to draft.", { id: toastId });
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not return model to draft."), { id: toastId });
    }
  }

  /* =====================================================
     🔹 CLONE MODEL
     Accepts the new version's name from CloneModelDialog (Step 9) and
     forwards it to the backend -- previously this took no argument at
     all, so whatever the user typed into "New Version Name" was silently
     discarded and the clone always kept the original model's name.
  ===================================================== */
  async function cloneModel(newName) {
    if (!model?.id) return;

    const toastId = toast.loading("Cloning model...");

    try {
      const cloned = await apiFetch(
        `/api/competencies/models/${model.id}/clone`,
        { method: "POST", body: JSON.stringify({ name: newName }) },
        auth
      );

      queryClient.invalidateQueries({ queryKey: competencyModelsKey });

      toast.success("Model cloned successfully.", { id: toastId });

      if (onCloned) onCloned(cloned);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Clone failed."), { id: toastId });
    }
  }

  async function archiveModel() {
    if (!model?.id) return;

    const toastId = toast.loading("Archiving model...");

    try {
      const archived = await apiFetch(
        `/api/competencies/models/${model.id}/archive`,
        { method: "POST" },
        auth
      );

      setModel(archived);
      setIsDirty(false);

      queryClient.invalidateQueries({ queryKey: competencyModelsKey });
      queryClient.invalidateQueries({ queryKey: competencyModelKey(model.id) });

      toast.success("Model archived.", { id: toastId });
    } catch (err) {
      toast.error(apiErrorMessage(err, "Archive failed."), { id: toastId });
    }
  }

  const value = {
    model,
    competencies,
    allModels,
    currentStep,
    setCurrentStep,
    loading,
    saving,
    isDirty,
    confirmAck,
    setConfirmAck,

    updateModelField,
    updateConstructFramework,
    patchConstructFramework,
    updateSmVariablePrior,

    addCompetency,
    updateCompetency,
    removeCompetency,

    addRelationship,
    removeRelationship,

    canProceed,
    saveDraft,
    saveAndReview,
    confirmModel,
    returnToDraft,
    cloneModel,
    archiveModel,
  };

  return (
    <CompetencyWizardContext.Provider value={value}>
      {children}
    </CompetencyWizardContext.Provider>
  );
}
