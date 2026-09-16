// src/pages/settings/BulkDownloadPanel.jsx
// ------------------------------------------------------------
// Settings > Data > Download. Seven independent JSON exporters, one per
// entity type, laid out to mirror BulkUploadPanel card-for-card: each
// export is a JSON array shaped like the file the matching upload card
// accepts, so exports round-trip back through Bulk Upload.
// ------------------------------------------------------------

import React from "react";
import BulkDownloadCard from "./BulkDownloadCard";

export default function BulkDownloadPanel() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Bulk Download</h2>
        <p className="text-sm text-muted-foreground">
          Export users, selection policies, curricular policies, Student Models, evidence
          models, task models, or items as a JSON file. Each file is a JSON array shaped like
          the one the matching Upload card accepts, so an export can be edited and imported
          again -- here or on another deployment.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <BulkDownloadCard
          title="Users"
          description="Array of { username, role, email, profile, createdAt }."
          kind="users"
          note="Passwords are never exported. Add a password to each row before re-importing."
        />

        <BulkDownloadCard
          title="Policies"
          description="Array of selection policy objects { name, type, description?, config? }."
          kind="policies"
        />

        <BulkDownloadCard
          title="Curricular Policies"
          description="Array of curriculum documents, each with its nested curricular goals, competencies, and learning outcomes."
          kind="curricularPolicies"
        />

        <BulkDownloadCard
          title="Student Models"
          description="Array of Student Models, each with its competencies nested under a competencies array -- the same shape the Student Models uploader accepts."
          kind="competencyModels"
          note="Ids are exported as-is; re-importing creates new models with newly generated ids."
        />

        <BulkDownloadCard
          title="Evidence Models"
          description="Array of full evidence model objects, including warrants, observables, evidence rules, and statistical models."
          kind="evidenceModels"
          note="Each row keeps its competencyId; re-importing into a different deployment needs that id (or a competencyName) remapped."
        />

        <BulkDownloadCard
          title="Task Models"
          description="Array of full task model objects, including their evidenceModelIds and expected observations."
          kind="taskModels"
          note="Re-importing needs the referenced evidence models to exist and be confirmed+locked."
        />

        <BulkDownloadCard
          title="Items"
          description="Array of full item objects, including their taskModelId and observation binding."
          kind="items"
          note="Re-importing needs the referenced task models to exist and be confirmed+locked."
        />
      </div>
    </div>
  );
}
