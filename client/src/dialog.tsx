import { render } from "preact";
import { Button } from "./web-awesome";
import type { ComponentChildren, HTMLAttributes } from "preact";
import { useLayoutEffect, useRef } from "preact/hooks";
import type WaDialog from "@awesome.me/webawesome/dist/components/dialog/dialog.js";

interface DialogProps {
  children: ComponentChildren;
  class?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  onClose: () => void;
  onKeyDown?: HTMLAttributes<WaDialog>["onKeyDown"];
  closeOnBackdrop?: boolean;
}

export function Dialog({
  children,
  class: className,
  "aria-label": label,
  "aria-labelledby": labelledBy,
  onClose,
  onKeyDown,
  closeOnBackdrop = false,
}: DialogProps) {
  const dialog = useRef<WaDialog>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useLayoutEffect(() => {
    const element = dialog.current!;
    const trigger = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    element.label =
      label ||
      (labelledBy && document.getElementById(labelledBy)?.textContent) ||
      "Dialog";
    const hide = (event: Event) => {
      if (event.target === element) close.current();
    };
    element.addEventListener("wa-after-hide", hide);
    document.body.style.overflow = "hidden";
    void element.updateComplete.then(() => {
      if (element.isConnected) element.open = true;
    });
    return () => {
      element.removeEventListener("wa-after-hide", hide);
      element.open = false;
      element.dialog?.close();
      document.body.style.overflow = previousOverflow;
      queueMicrotask(() => {
        if (trigger?.isConnected) trigger.focus();
      });
    };
  }, []);
  return (
    <wa-dialog
      ref={dialog}
      class={className ? `dialog ${className}` : "dialog"}
      withoutHeader
      lightDismiss={closeOnBackdrop}
      onKeyDown={onKeyDown}
    >
      {children}
    </wa-dialog>
  );
}

let pendingConfirmation: Promise<boolean> | undefined;

export function confirmAction(message: string): Promise<boolean> {
  if (pendingConfirmation) return Promise.resolve(false);
  pendingConfirmation = new Promise((resolve) => {
    const container = document.createElement("div");
    document.body.append(container);
    const finish = (confirmed: boolean) => {
      render(null, container);
      container.remove();
      pendingConfirmation = undefined;
      resolve(confirmed);
    };
    render(
      <Dialog
        class="confirmation-dialog"
        aria-label="Confirm action"
        onClose={() => finish(false)}
      >
        <h2>Confirm action</h2>
        <p>{message}</p>
        <div class="actions">
          <Button
            type="button"
            variant="danger"
            appearance="accent"
            onClick={() => finish(true)}
          >
            Confirm
          </Button>
          <Button type="button" autoFocus onClick={() => finish(false)}>
            Cancel
          </Button>
        </div>
      </Dialog>,
      container,
    );
  });
  return pendingConfirmation;
}
