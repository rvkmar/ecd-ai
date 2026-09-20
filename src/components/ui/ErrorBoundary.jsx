// src/components/ui/ErrorBoundary.jsx
// ------------------------------------------------------------
// A render-error boundary.
//
// There was none anywhere in this application. A single bad field --
// `toolsAllowed` being a string where one component expected an array --
// threw out of a render and React unmounted the ENTIRE admin console to a
// blank white page, with the only diagnostic in the browser console.
// Fixing that one field does not fix the class: any future type
// disagreement between two components does the same thing.
//
// The boundary is deliberately per-surface rather than one at the root.
// A wizard step that fails should cost the reader that step, not their
// place in the wizard and not the rest of the console -- so the step body
// gets its own boundary, and the frame around it (the rail, the nav bar,
// Close) keeps working.
//
// `resetKey` is how the boundary un-latches: React keeps a caught
// boundary in its error state until something tells it the cause may have
// changed. Passing the current step key means moving off a broken step
// and back onto it retries the render instead of showing the error
// forever.
// ------------------------------------------------------------

import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { reportClientError } from "@/utils/clientErrorReporter";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error(
      `[ErrorBoundary${this.props.label ? ` · ${this.props.label}` : ""}]`,
      error,
      info?.componentStack
    );
    reportClientError(error, {
      label: this.props.label,
      componentStack: info?.componentStack,
    });
  }

  render() {
    const { error } = this.state;

    if (!error) return this.props.children;

    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle
            size={18}
            strokeWidth={2.25}
            className="mt-0.5 shrink-0 text-red-600"
          />
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-red-800">
              {this.props.label
                ? `This step could not be displayed`
                : "This section could not be displayed"}
            </h3>

            <p className="mt-1 text-sm text-red-700">
              The rest of the page still works — use Back, or move to another
              step. Nothing has been saved or lost.
            </p>

            <p className="mt-3 break-words font-mono text-xs text-red-600">
              {error.message || String(error)}
            </p>

            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-50"
            >
              <RefreshCw size={13} strokeWidth={2.25} />
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }
}
