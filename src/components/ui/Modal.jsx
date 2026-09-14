import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./dialog";

// Confirm/discard overlay used by SessionPlayer Finish and (after D73)
// the wizard discard copies. Radix Dialog supplies role="dialog",
// aria-modal, focus trap, and Escape — the hand-rolled overlay had none
// of those (F-A1).
export default function Modal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  children,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  confirmClass = "bg-blue-500 hover:bg-blue-600 text-white",
}) {
  const handleConfirm = () => {
    if (onConfirm) onConfirm();
    if (onClose) onClose();
  };

  return (
    <Dialog
      open={!!isOpen}
      onOpenChange={(open) => {
        if (!open) onClose?.();
      }}
    >
      <DialogContent className="max-w-sm bg-white text-slate-900 sm:rounded-xl">
        <DialogHeader>
          <DialogTitle className="font-bold text-lg text-left">{title}</DialogTitle>
          {message ? (
            <DialogDescription className="text-left text-slate-600">
              {message}
            </DialogDescription>
          ) : null}
        </DialogHeader>
        {children}
        <DialogFooter className="flex-row justify-end gap-2 sm:space-x-0">
          <button
            type="button"
            onClick={() => onClose?.()}
            className="px-3 py-1 bg-gray-300 hover:bg-gray-400 rounded"
          >
            {cancelLabel}
          </button>
          {onConfirm && (
            <button
              type="button"
              onClick={handleConfirm}
              className={`px-3 py-1 rounded ${confirmClass}`}
            >
              {confirmLabel}
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
