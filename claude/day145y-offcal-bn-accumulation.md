# Off-calendar: Bayesian network evidence accumulation

**Not D146.** Not a calendar unit. When a session's measurement model is a Bayesian network, each scored observable updates the posterior over the student model variable. Those posteriors are stored, carried forward, shown on reports, and used to rank the next task. The W29 gate stays open.

## Premise

`server/delivery/evidenceAccumulation.js` scored IRT, Rasch, CTT, DINA, and G-DINA. A `bayesian_network` statistical model returned "not implemented yet", so `bnPosteriors` was never written (F24). `selectBayesianNetwork` therefore often had nothing to rank and delivered pool order.

D129 is a continuous bivariate EAP over `competencyModels.jointPrior`. The ledger says not to reopen it as unused at scoring. This unit does not read `jointPrior`. The discrete prior is the student model variable prior, `structureConfig.prior`, the parameter-set `_prior`, or a carried-forward distribution.

## Inference

Exact Bayes, in process, in Node, in log space. No new dependency, no paid API, and no call to the R Plumber service. The authored network is a naive Bayes star: one discrete student model variable, and binary observables that are independent given that variable.

`structureConfig.latentNodes` holds the latent node. `observableIds` and `edges` name the observables that depend on it. An empty edge list means that star. The conditional probability table is `structureConfig.cpt` or a `bayesian-cpt` parameter set. `structureConfig.smvId` binds the latent node to the student model variable. A latent node id that is itself an SMV id is accepted when `smvId` is absent.

`bnPosteriors[smvId]` is the probability of the last state. For states `[not_mastered, mastered]` that is P(mastered). The full distribution is `smvPosteriors[smvId].distribution`. Precision is the standard deviation of the state index. For a binary variable that is `sqrt(p(1-p))`, the same summary DINA already stores.

Size limits, refused rather than approximated: at most 8 states on the variable, and at most 64 observables. A likelihood of 0 rules that state out. If every state is impossible, no posterior is reported.

## What is scored

Supported:

- One binary, ordinal, or categorical student model variable.
- A star from that variable to its observables.
- A conditional probability in 0 to 1 for every state of every observable.
- A prior that sums to 1: bernoulli or beta on a binary variable, dirichlet on an ordinal or categorical variable, `structureConfig.prior`, or the parameter-set `_prior`.
- A pilot snapshot pinned on the response, or one calibrated parameter set.
- A carried-forward distribution whose states match, used as the prior for this occasion only.

Blocked, with a readable error, rather than a silent score:

- More than one latent node.
- An edge that is not from the latent node to one of its observables.
- A continuous student model variable.
- More than 8 states, or more than 64 observables.
- A missing or invalid conditional probability table, or a missing prior.
- Pilot responses in one session whose pinned tables disagree.
- A carried distribution whose states do not match.
- Data that is impossible under the table.
- Two supported posteriors for the same student model variable. The existing collision rule drops both, including `bnPosteriors` for that id.

Other measurement models are unchanged. DINA selection still skips an attribute with no live posterior and does not invent 0.5. G-DINA is still unrankable.

## Delivery

Submit pins a pilot table, or the calibrated parameter set, the same way IRT and DINA already freeze a source. If the scored observable has no conditional probability, submit returns 400 and does not store the response.

Resume recomputes only `bayesian_network` posteriors. An IRT, CTT, or DINA `updatedAt` is left as it was. If the refreshed session would fail validation, the status still flips and the previous posteriors stay.

When carry-forward is on, seeding copies a Bayesian network distribution into `carriedForward.priors[smvId]`. The next accumulation uses that snapshot as the prior and the new responses as the likelihood. It does not treat the copied live posterior as another observation.

`selectBayesianNetwork` ranks a `bayesian_network` candidate by expected information gain. The belief is the live distribution when the states match, else the carried-forward prior, else the model prior, so the first item can be ranked. A tie keeps the earlier candidate. Pool order plus a warning remains only when nothing can be ranked.

Reports keep `bnPosteriors` values as numbers, so class and district means still sum probabilities. The distribution is attached on the session construct, on learner `bayesianNetwork`, and on the teacher model summary. Session Report renders that list.

## Sample

Fraction evidence keeps its active IRT model and gains an inactive `sm-frac-bn` over `smv-equiv`, with a conditional probability for `obs-equiv`. The zip still has three evidence models and flat JSON at the zip root.

## Exit check

| Work | Exit check | Status |
|---|---|---|
| Update | A scored observable updates the discrete posterior | **DONE** |
| Store | `bnPosteriors` is the last-state probability. The distribution is on `smvPosteriors` | **DONE** |
| Resume | Bayesian network posteriors refresh. Other families keep their stamp | **DONE** |
| Carry-forward | The previous distribution is the prior for this occasion | **DONE** |
| Selection | Information gain uses that belief. Pool order remains for a network that cannot be ranked | **DONE** |
| Reports | Session, learner, and teacher views show the node and the distribution | **DONE** |
| Other models | IRT, Rasch, CTT, DINA, and G-DINA accumulation are unchanged | **DONE** |
| Zip | `samples/ecd-sample-complete.zip` imports with 0 failures | **DONE** |
| jointPrior | Not read. D129 is cross-referenced only | **DONE** |

## Verification

```
NODE_OPTIONS=--max-old-space-size=4096 npx vitest run
  2552 passed | 10 skipped (294 files, 61.69s)
  Node on this VM is v22. package.json engines asks for Node >= 24.

npm run build
  green (vite, 1.21s). Largest JS chunk recharts 425.06 kB (gzip 117.21 kB).
  EvidenceModelBuilder 373.88 kB (gzip 82.86 kB).

npm audit --audit-level=high
  found 0 vulnerabilities
```

`samples/ecd-sample-complete.zip`: the import test still requires 0 failures and the same row counts (45 governed rows, evidence models 3). Both new ids and keep-original-ids. The inactive Bayesian network is inside Fraction evidence, not a fourth evidence model.

Hand-checked accumulation, in `server/delivery/__tests__/bayesianNetwork.test.js`:

- Prior 0.5/0.5, P(u=1|mastered)=0.8, P(u=1|not mastered)=0.2, u=1 gives P(mastered)=0.8.
- A second observable with 0.9 and 0.3, u=0, gives 4/11 and 7/11.
- Three states 0.2, 0.5, 0.3 with 0.1, 0.5, 0.9 and u=1 give 1/27, 25/54, and 0.5.
- Information gain at 0.5 with 0.8/0.2 is about 0.2780719051126377 bits.
- Carry-forward from P(mastered)=0.8 through 0.9/0.1 and u=1 gives 36/37. The same response from 0.5 gives 0.9.

## Browser

Session Report now lists the Bayesian network posterior. Signed in as an admin on the local JSON harness, opened Evidence Accumulation, and inspected session `s-bn-demo`. Learner Feedback and Teacher Report both show `smv-equiv: 80% (Strong)` with `not_mastered 20%` and `mastered 80%`.

## Left for later

- G21. Characteristic features and rubric ids still do not flow into the seeded task model.
- G22. `valuedKnowledge` and `taskFeatures` are still not cited by id downstream.
- G-DINA information gain is still not computed (D60 P1-5). BayesianNetwork selection still delivers pool order for that family.
- Item-path IRT already ranks by maximum Fisher information (`criterion: "max-fisher"`). The legacy question path, a task with `questionId` and no `itemId`, is still nearest difficulty. This unit does not change either path.

## Compression debt

None new.

## Calendar

D146 was not marked. This change has no calendar event.

## Next

Do not treat this as D146. W29 stays open. Calendar next stays D151 alone. The next textbook gap is G21.
