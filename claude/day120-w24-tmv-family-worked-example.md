# W24 worked example — ten-spec TMV family (D120)

This is the paper design D120’s exit check requires: settings a future
template (W26) would carry so W31 can generate a family of **exactly ten**
task specs that differ **only** in declared Task Model Variable values.

Library records (defined once; any number of Task Models may bind them):

| id | name | type | levels |
|---|---|---|---|
| `tmv-bloom` | Cognitive demand | categorical `valueSet: bloomLevel` | remember … create (6) |
| `tmv-register` | Scenario register | categorical author list | formal, informal |
| `tmv-stimulus` | Stimulus policy | categorical `valueSet: stimulusPolicy` | static, parameterized, generative |

Per-Task-Model / per-template settings (`taskModelVariableSettings`):

```json
[
  {
    "taskModelVariableId": "tmv-bloom",
    "variation": "varying",
    "required": true,
    "allowedValues": ["remember", "understand", "apply", "analyze", "evaluate"]
  },
  {
    "taskModelVariableId": "tmv-register",
    "variation": "varying",
    "required": true,
    "allowedValues": ["formal", "informal"]
  },
  {
    "taskModelVariableId": "tmv-stimulus",
    "variation": "fixed",
    "required": true,
    "fixedValue": "static"
  }
]
```

Family size = 5 × 2 × 1 = **10**.

| # | bloom | register | stimulus |
|---|---|---|---|
| 1 | remember | formal | static |
| 2 | remember | informal | static |
| 3 | understand | formal | static |
| 4 | understand | informal | static |
| 5 | apply | formal | static |
| 6 | apply | informal | static |
| 7 | analyze | formal | static |
| 8 | analyze | informal | static |
| 9 | evaluate | formal | static |
| 10 | evaluate | informal | static |

Asserted by `projectTaskSpecFamilySize` / `projectTaskSpecFamily` in
`src/utils/__tests__/taskModelVariableFamily.test.js`. W31 must refuse or
confirm above a stated size; D127 surfaces this projection in the template
builder.

**Not claimed here:** D119 re-point of `taskStructure.presentationMode` (etc.)
at registry ids; W26 `templates` collection; actual generation.
