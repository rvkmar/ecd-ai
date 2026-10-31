// Client clock for one on-screen task. Tab-hidden time is counted apart
// from visible time. The server still measures the visit; these numbers
// are the supplement (hidden time, and a client presentedAt).

export function createItemResponseTimer(now = () => Date.now()) {
  let taskId = null;
  let clientPresentedAt = null;
  let visibleMs = 0;
  let hiddenMs = 0;
  let lastTick = null;
  let hidden = false;

  function readHidden() {
    if (typeof document === "undefined") return false;
    return document.visibilityState === "hidden";
  }

  function tick(at) {
    if (lastTick == null || taskId == null) {
      lastTick = at;
      return;
    }
    const delta = Math.max(0, at - lastTick);
    if (hidden) hiddenMs += delta;
    else visibleMs += delta;
    lastTick = at;
  }

  return {
    get taskId() {
      return taskId;
    },
    start(nextTaskId, at = now()) {
      if (!nextTaskId) return null;
      if (taskId === nextTaskId && lastTick != null) {
        tick(at);
        return this.snapshot(at);
      }
      taskId = nextTaskId;
      clientPresentedAt = new Date(at).toISOString();
      visibleMs = 0;
      hiddenMs = 0;
      lastTick = at;
      hidden = readHidden();
      return {
        taskId,
        clientPresentedAt,
        visibleMs: 0,
        hiddenMs: 0,
      };
    },
    setHidden(isHidden, at = now()) {
      tick(at);
      hidden = Boolean(isHidden);
    },
    snapshot(at = now()) {
      tick(at);
      return {
        taskId,
        clientPresentedAt,
        visibleMs: Math.round(visibleMs),
        hiddenMs: Math.round(hiddenMs),
      };
    },
  };
}
