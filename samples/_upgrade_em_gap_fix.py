# Upgrade Newtonian EM samples for G2–G4: artifacts, workProductId,
# shared WP multi-OV example, and pilot parameterSets (confirm-ready).
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PATH = ROOT / "newtonian_mechanics_evidence_models.json"
ARRAY_PATH = ROOT / "newtonian_mechanics_evidence_models_array.json"

PILOT = {
    "packageVersion": "ecd-pilot-1.0.0",
    "converged": True,
    "sampleSize": 220,
    "calibratedAt": "2026-09-01T00:00:00.000Z",
    "calibratedBy": "newtonian-enterprise-seed",
    "calibrationMethod": "pilot_seed",
    "notes": "Synthetic pilot parameter set for enterprise gap-fix closeout; replace after live calibration.",
}


def key_artifact(patterns, ref):
    return {
        "artifactRef": ref,
        "artifact": {"kind": "key", "correctPatterns": patterns},
    }


def rubric_artifact(dims, ref):
    return {
        "artifactRef": ref,
        "artifact": {"kind": "rubric", "dimensions": dims},
    }


def process_artifact(ref):
    return {
        "artifactRef": ref,
        "artifact": {
            "kind": "auto",
            "scorerId": "process_log_v1",
            "config": {"events": ["node_visit", "edge_draw", "finalize"]},
        },
    }


def attach_proc_fields(proc):
    method = proc.get("method")
    oid = proc.get("observableId", "obs")
    if not proc.get("workProductId"):
        proc["workProductId"] = f"wp_{oid}"
    if method == "key":
        if not proc.get("artifact"):
            proc.update(key_artifact([{ "selected": "opt_correct" }], f"inline:key/{oid}"))
    elif method == "rubric":
        if not proc.get("artifact"):
            proc.update(
                rubric_artifact(
                    [
                        {
                            "id": "accuracy",
                            "levels": [0, 1, 2],
                            "description": "Feature accuracy on constructed work product",
                        }
                    ],
                    f"inline:rubric/{oid}",
                )
            )
    elif method in ("auto", "process_log"):
        if not proc.get("artifact"):
            # process_log uses auto-shaped artifact for bakeability under G3
            # methods that require artifact; process_log itself is exempt from
            # G3 ARTIFACT_METHODS but we still attach for Identification.
            if method == "process_log":
                proc["artifactRef"] = proc.get("artifactRef") or f"inline:process/{oid}"
                proc["artifact"] = {
                    "kind": "auto",
                    "scorerId": "process_log_v1",
                    "config": {"events": ["node_visit", "edge_draw", "finalize"]},
                }
            else:
                proc.update(process_artifact(f"inline:auto/{oid}"))
    return proc


def seed_params(sm, em_name):
    """Attach a converged pilot parameter set appropriate to the model family."""
    sm = dict(sm)
    t = sm.get("type")
    subtype = sm.get("subtype")
    obs_ids = (sm.get("structureConfig") or {}).get("observableIds") or []
    ps_id = f"ps_pilot_{sm.get('id', 'sm')}"

    if t in ("dina", "gdina"):
        parameters = {
            oid: {"slip": 0.12, "guess": 0.18} for oid in obs_ids
        } or {"default": {"slip": 0.12, "guess": 0.18}}
    elif t == "irt" and subtype == "pcm":
        parameters = {
            oid: {"a": 1.0, "b": [-1.0, 0.2, 1.1]} for oid in obs_ids
        } or {"default": {"a": 1.0, "b": [-1.0, 0.2, 1.1]}}
    elif t == "irt":
        parameters = {
            oid: {"a": 1.1, "b": -0.2} for oid in obs_ids
        } or {"default": {"a": 1.1, "b": -0.2}}
    elif t == "bayesian_network":
        parameters = {
            "cpts": {"pilot": True, "note": f"Seed CPTs for {em_name}"},
            "nodes": obs_ids,
        }
    elif t == "threshold":
        parameters = {oid: {"cut": 0.5} for oid in obs_ids}
    else:
        parameters = {oid: {"weight": 1.0} for oid in obs_ids}

    # Only active models get pilot params for confirm; inactive keep empty.
    if sm.get("active"):
        sm["parameterSets"] = [
            {
                "parameterSetId": ps_id,
                "parameters": parameters,
                **PILOT,
            }
        ]
        sm["activeParameterSetId"] = ps_id
    else:
        sm["parameterSets"] = []
        sm["activeParameterSetId"] = None
    return sm


def upgrade_em(em):
    em = dict(em)
    procs = [attach_proc_fields(dict(p)) for p in (em.get("evaluationProcedures") or [])]

    # G2 example on Force: share workProductId across pair + diagram if both exist
    if "Force Concept" in (em.get("name") or ""):
        pair = next((p for p in procs if p.get("observableId") == "obs_force_pair"), None)
        diagram = next((p for p in procs if p.get("observableId") == "obs_force_diagram"), None)
        net = next((p for p in procs if p.get("observableId") == "obs_force_net"), None)
        if pair and diagram:
            # Multi-OV from diagram WP: keep diagram as constructed; add a second
            # procedure already present — share wp between net and diagram for
            # free-body diagram stem that also yields net-force reading.
            if net:
                shared = "wp_force_fbd"
                diagram["workProductId"] = shared
                # Keep diagram rubric; net stays mcq but document shared stem id
                # for the constructed path — actually net is separate MCQ.
                # Share pair+net under one mcq stem family when both key methods.
                pair["workProductId"] = "wp_force_mcq_stem"
                if net.get("method") == "key":
                    net["workProductId"] = "wp_force_mcq_stem"
                    net["workProductType"] = pair.get("workProductType") or "mcq_selection"

    em["evaluationProcedures"] = procs
    em["statisticalModels"] = [
        seed_params(sm, em.get("name") or "") for sm in (em.get("statisticalModels") or [])
    ]
    # Drafts cannot carry parameterSets — samples are still uploaded as draft.
    # Store pilot sets under calibrationPlan.seedParameterSets for attach after
    # confirm, AND also leave active SM parameterSets empty for draft upload.
    seed_sets = []
    for sm in em["statisticalModels"]:
        if sm.get("parameterSets"):
            seed_sets.append(
                {
                    "statisticalModelId": sm["id"],
                    "parameterSet": sm["parameterSets"][0],
                }
            )
            sm["parameterSets"] = []
            sm["activeParameterSetId"] = None
    plan = dict(em.get("calibrationPlan") or {})
    plan["seedParameterSets"] = seed_sets
    plan.setdefault("pilotSampleSize", 220)
    plan.setdefault("method", "pilot_seed")
    plan.setdefault("packageHint", "ecd-pilot-1.0.0")
    plan.setdefault(
        "targetFitNotes",
        "After review, POST seedParameterSets onto the confirmed EM active statistical model.",
    )
    em["calibrationPlan"] = plan
    return em


def main():
    data = json.loads(PATH.read_text(encoding="utf-8"))
    ems = data.get("evidenceModels") or data
    upgraded = [upgrade_em(em) for em in ems]
    if isinstance(data, dict) and "evidenceModels" in data:
        out = {"competencyModelId": data.get("competencyModelId"), "evidenceModels": upgraded}
        # drop None competencyModelId noise
        if out["competencyModelId"] is None:
            out.pop("competencyModelId", None)
        PATH.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    else:
        PATH.write_text(json.dumps(upgraded, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    ARRAY_PATH.write_text(json.dumps(upgraded, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    # Companion file with confirm-ready copies (parameterSets attached) for
    # lifecycle closeout / Accumulation smoke — not bulk-uploaded as draft.
    confirm_ready = []
    for em in upgraded:
        em2 = json.loads(json.dumps(em))
        seeds = (em2.get("calibrationPlan") or {}).get("seedParameterSets") or []
        by_sm = {s["statisticalModelId"]: s["parameterSet"] for s in seeds}
        for sm in em2.get("statisticalModels") or []:
            if sm.get("id") in by_sm and sm.get("active"):
                ps = by_sm[sm["id"]]
                sm["parameterSets"] = [ps]
                sm["activeParameterSetId"] = ps["parameterSetId"]
        confirm_ready.append(em2)
    (ROOT / "newtonian_mechanics_evidence_models_confirm_ready.json").write_text(
        json.dumps({"evidenceModels": confirm_ready}, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print("upgraded", len(upgraded), "EMs")


if __name__ == "__main__":
    main()
