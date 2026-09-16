// src/pages/settings/BulkUploadPanel.jsx
// ------------------------------------------------------------
// Settings > Bulk Upload. Six independent JSON importers, one per entity
// type, per the user's explicit decisions:
//   - format: JSON array of full entity objects for all six
//   - no cross-entity smart ordering: each uploader just replays the
//     single-create validation/logic per row (see the server/routes/*.js
//     createXRecord() helpers each endpoint below calls into)
// ------------------------------------------------------------

import React from "react";
import BulkUploadCard from "./BulkUploadCard";
import UnifiedBulkUploadPanel from "./UnifiedBulkUploadPanel";
import { usersKey } from "@/api/queries/users";
import { policiesKey } from "@/api/queries/policies";
import { curricularPoliciesKey } from "@/api/queries/curricularPolicies";
import { competencyModelsKey } from "@/api/queries/competencies";
import { evidenceModelsKey } from "@/api/queries/evidenceModels";
import { taskModelsKey } from "@/api/queries/taskModels";
import { itemsKey } from "@/api/queries/items";
import { qMatrixModelsKey } from "@/api/queries/qMatrixModels";
import { assemblyModelsKey } from "@/api/queries/assemblyModels";

export default function BulkUploadPanel() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Bulk Upload</h2>
        <p className="text-sm text-muted-foreground">
          Import users, selection policies, curricular policies, Student Models, evidence
          models, task models, or items from a JSON file. Every row is created as a{" "}
          <span className="font-medium text-foreground">draft</span> and validated with the same
          rules as creating it one at a time, with one relaxation specific to importing: a parent
          referenced here may itself still be a draft, so a whole authored chain can land in one
          sitting. A row whose parent doesn't exist at all still fails just that row, and
          confirming any record still enforces the full confirmed+locked chain.
        </p>
      </div>

      <UnifiedBulkUploadPanel />

      <div className="pt-2">
        <h3 className="text-sm font-semibold">Or upload one entity type at a time</h3>
        <p className="text-xs text-muted-foreground">
          The cards below are the single-entity uploaders, unchanged. Each takes one JSON array
          and posts it to that entity's /bulk endpoint on its own.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <BulkUploadCard
          title="Users"
          description="Array of { username, password, role, email?, profile? }."
          endpoint="/api/users/bulk"
          invalidateKey={usersKey}
          sampleHint='e.g. [{ "username": "jdoe", "password": "temp1234", "role": "teacher" }]'
        />

        <BulkUploadCard
          title="Policies"
          description="Array of { name, type, description?, config? }."
          endpoint="/api/policies/bulk"
          invalidateKey={policiesKey}
          sampleHint='e.g. [{ "name": "Fixed Form A", "type": "fixed", "config": {} }]'
        />

        <BulkUploadCard
          title="Curricular Policies"
          description={'Array of { name, description?, version?, issuingBody?, subject?, stage?, curricularGoals }. Each curricular goal needs a code and a statement and may nest competencies (code, statement, optional learningOutcomes). These are curriculum documents (e.g. NCF-SE 2023), not the adaptive selection policies above -- they populate the policy/curricular-goal dropdowns in Competency Wizard Step 3. The same uploader also lives at Settings > Policies > Curricular Policies.'}
          endpoint="/api/curricularPolicies/bulk"
          invalidateKey={curricularPoliciesKey}
          sampleHint='See samples/sample-curricular-policies.json for a ready-to-edit example.'
        />

        <BulkUploadCard
          title="Student Models"
          description='Array of { name, description?, measurementIntent, psychologicalPerspective?, constructFramework?, smVariables?, competencies? }. Nested competencies may cite sibling targets by export id or targetCompetencyName; SMVs/priors are remapped on import. Also accepts { "competencyModels": [...] } or a Step 9 specification export ({ model, competencies, smVariables }).'
          endpoint="/api/competencies/models/bulk"
          invalidateKey={competencyModelsKey}
          studentModel
          sampleHint='See samples/competency_models_bulk_upload_sample.json — or re-upload a Step 9 *_specification.json download.'
        />

        <BulkUploadCard
          title="Evidence Models"
          description={'Array of full evidence model objects (or { evidenceModels: [...] }). Enter a Student Model id to scope competencyName remapping to that model, then choose a file and click Upload. Also accepts newtonian_mechanics_evidence_models.json.'}
          endpoint="/api/evidenceModels/bulk"
          invalidateKey={evidenceModelsKey}
          evidenceModel
          sampleHint='See samples/newtonian_mechanics_evidence_models.json — pick your Newtonian Student Model id, then choose the file.'
        />

        <BulkUploadCard
          title="Task Models"
          description="Array of full task model objects, each requiring existing evidenceModelIds. Bulk upload accepts evidence models that are still drafts (the wizard's single-create path does not) -- the confirmed+locked requirement is enforced when the task model is confirmed, not when it is imported."
          endpoint="/api/taskModels/bulk"
          invalidateKey={taskModelsKey}
          sampleHint='e.g. [{ "name": "...", "evidenceModelIds": ["em1699999999"], "expectedObservations": [...] }]'
        />

        <BulkUploadCard
          title="Items"
          description="Array of full item objects, each requiring an existing taskModelId that declares the observationId used. Bulk upload accepts a task model that is still a draft; confirming the item still requires a confirmed+locked one."
          endpoint="/api/items/bulk"
          invalidateKey={itemsKey}
          sampleHint='e.g. [{ "taskModelId": "tm1699999999", "observationId": "obs1", ... }]'
        />

        <BulkUploadCard
          title="Q-matrix Models"
          description='Array of { name, competencyModelId|competencyModelName, attributeIds|attributeNames, entries: [{ itemId|itemName, attributeId|attributeName, required? }] }. Used by DINA/G-DINA Evidence Models.'
          endpoint="/api/qMatrixModels/bulk"
          invalidateKey={qMatrixModelsKey}
          sampleHint="See samples/newtonian_force_qmatrix.json"
        />

        <BulkUploadCard
          title="Assembly Models"
          description='Array of { name, competencyModelId|competencyModelName, targetsBySMV: [{ smvId|smvName, requiredSEM|requiredClassificationAccuracy }], stoppingRules, selectionAlgorithm: { policyId|policyName } }.'
          endpoint="/api/assemblyModels/bulk"
          invalidateKey={assemblyModelsKey}
          sampleHint="See samples/newtonian_mechanics_assembly.json"
        />
      </div>
    </div>
  );
}
