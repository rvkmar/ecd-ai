// `useAuth` was imported here and never referenced -- apiFetch takes the
// auth object as a parameter, which is why every call site passes it. The
// dead import dragged the React auth context (and its whole transitive
// graph) into every module that touches the API layer, and made this file
// unloadable outside a React environment even though everything in it is
// a plain function.

// A wrapper around fetch that includes Authorization header if logged in
export function apiFetch(url, options = {}, auth) {
  // rawBody: send the body as given (a zip File) and keep the caller's
  // Content-Type. responseType "blob": return the bytes (the entity zip
  // export) instead of parsing JSON. Both are stripped before fetch().
  const { rawBody = false, responseType, ...rest } = options;
  const headers = { ...(rest.headers || {}) };
  if (!rawBody) headers["Content-Type"] = "application/json";
  if (auth?.token) headers["Authorization"] = `Bearer ${auth.token}`;

  return fetch(url, { ...rest, headers }).then(async (res) => {
    if (!res.ok) {
      const text = await res.text();
      const error = new Error(`${res.status}: ${text}`);
      error.status = res.status;
      // Best-effort parse so callers can surface the backend's own error
      // message (see apiErrorMessage below) instead of just the raw
      // "<status>: <body>" string. Never throws -- body stays null for a
      // non-JSON response.
      try {
        error.body = JSON.parse(text);
      } catch {
        error.body = null;
      }
      throw error;
    }

    // A successful response isn't guaranteed to carry a JSON body -- every
    // DELETE route in this API (competency models, competencies, evidence
    // models, ...) responds `res.status(204).end()` on success, with an
    // empty body. res.json() throws on an empty body ("Unexpected end of
    // JSON input"), which turned every successful delete into a *rejected*
    // apiFetch promise: react-query's mutation onError fired a "Delete
    // failed" toast for a delete that had already succeeded server-side,
    // and onSuccess -- where the query-cache invalidation that removes the
    // row from the list lives -- never ran, leaving the deleted row visible
    // until a manual page refresh. Read the body as text first and only
    // attempt to parse it as JSON if there's actually something there.
    if (res.status === 204) return null;
    if (responseType === "blob") return res.blob();

    const text = await res.text();
    if (!text) return null;

    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  });
}

// Phase 2 helper: most of the app's mutation error handlers used to do
// `const err = await res.json(); toast.error(err.error || "fallback")` (or,
// for a couple of endpoints, `data.errors?.join(" ") || data.error`) right
// after a raw fetch(). apiFetch() now attaches the parsed body to the
// thrown Error as `.body`, so react-query's mutation onError handlers can
// get the same backend-provided message via this helper instead of each
// re-implementing the same parsing.
export function apiErrorMessage(err, fallback) {
  const body = err?.body;
  if (!body) return fallback;

  if (Array.isArray(body.errors) && body.errors.length) return body.errors.join(", ");

  /* `details` was not read here, and it is where the actionable reason
     lives on every validation failure this API produces:

         { "error": "Item lifecycle validation failed.",
           "details": ["An IRT-scored item must carry at least
                        discrimination (a) and difficulty (b) ..."] }

     So "Send to review" surfaced only the headline -- "Item lifecycle
     validation failed." -- and dropped the one sentence that said what to
     do about it. The Server-preflight panel rendered `details` correctly
     because it reads the response body itself, which is exactly the
     inconsistency: two renderings of the same failure, one useful.

     Reading it here fixes every call site at once -- toasts, the modals
     and the wizard context all funnel through this function. */
  const details = Array.isArray(body.details)
    ? body.details.filter(Boolean)
    : [];

  const headline = body.error || body.message || fallback;

  if (details.length === 0) return headline;

  // The headline is a category ("validation failed") and the details are
  // the substance. Lead with the substance; keep the headline only when it
  // adds something the details do not.
  if (details.length === 1) return details[0];

  return `${headline} ${details.join(" ")}`;
}

