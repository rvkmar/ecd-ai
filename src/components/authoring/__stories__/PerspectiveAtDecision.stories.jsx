import PerspectiveAtDecision from "../PerspectiveAtDecision";
import { readStudentPerspective } from "@/utils/perspectiveInheritance";

const meta = {
  title: "Authoring/PerspectiveAtDecision",
  component: PerspectiveAtDecision,
};
export default meta;

const analysis = {
  id: "da1",
  name: "Fractions",
  psychologicalPerspective: "information_processing",
};

export const Inherited = {
  render: () => (
    <PerspectiveAtDecision
      reading={readStudentPerspective(
        { id: "cm1", domainAnalysisId: "da1", psychologicalPerspective: "information_processing" },
        [analysis]
      )}
    />
  ),
};

export const Override = {
  render: () => (
    <PerspectiveAtDecision
      reading={readStudentPerspective(
        { id: "cm1", domainAnalysisId: "da1", psychologicalPerspective: "trait" },
        [analysis]
      )}
    />
  ),
};
