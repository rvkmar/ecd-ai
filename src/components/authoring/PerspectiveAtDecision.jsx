import { perspectiveReadout } from "@/utils/perspectiveInheritance";

export default function PerspectiveAtDecision({ reading }) {
  const text = perspectiveReadout(reading);
  if (!text) return null;
  return <p className="text-xs text-slate-600">Perspective: {text}</p>;
}
