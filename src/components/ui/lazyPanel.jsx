// Shared Suspense wrapper for route- and tab-level code splits (D74).
import { lazy, Suspense } from "react";
import Spinner from "./Spinner";

export function lazyPanel(importer) {
  const Comp = lazy(importer);
  return function LazyPanel(props) {
    return (
      <Suspense fallback={<Spinner />}>
        <Comp {...props} />
      </Suspense>
    );
  };
}
