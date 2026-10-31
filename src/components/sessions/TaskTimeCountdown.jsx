import { useEffect, useRef, useState } from "react";
import { taskRemainingMs } from "../../utils/taskConstraints";

export function formatTaskRemaining(ms) {
  const total = Math.max(0, Math.ceil(Number(ms) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/**
 * Per-task countdown. limitMs is the effective limit, already accommodated
 * when the session stamp says so. This component does not scale it.
 * At zero it calls onExpire once and shows the expiry line. The parent
 * submits the current answer. A missing limit or present clock renders
 * nothing.
 */
export default function TaskTimeCountdown({
  limitMs,
  openPresentedAt,
  accruedMs = 0,
  storedMs = 0,
  active = true,
  onExpire,
}) {
  const [remaining, setRemaining] = useState(() =>
    taskRemainingMs({
      limitMs,
      openPresentedAt,
      accruedMs,
      storedMs,
      now: Date.now(),
    })
  );
  const firedRef = useRef(false);
  const visitKeyRef = useRef(null);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    if (!active) return undefined;
    if (typeof limitMs !== "number" || !openPresentedAt) return undefined;

    const visitKey = `${openPresentedAt}|${limitMs}`;
    if (visitKeyRef.current !== visitKey) {
      visitKeyRef.current = visitKey;
      firedRef.current = false;
    }

    function tick() {
      const left = taskRemainingMs({
        limitMs,
        openPresentedAt,
        accruedMs,
        storedMs,
        now: Date.now(),
      });
      setRemaining(left);
      if (left != null && left <= 0 && !firedRef.current) {
        firedRef.current = true;
        onExpireRef.current?.();
      }
    }

    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [active, limitMs, openPresentedAt, accruedMs, storedMs]);

  if (!active) return null;
  if (remaining == null) return null;

  if (remaining <= 0) {
    return (
      <p
        className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
        data-testid="task-time-expired"
        role="status"
      >
        Time is up for this question. Your current answer is being submitted.
      </p>
    );
  }

  return (
    <p
      className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-900"
      data-testid="task-time-remaining"
      role="timer"
      aria-live="polite"
    >
      Question time remaining: <strong>{formatTaskRemaining(remaining)}</strong>
    </p>
  );
}
