import type { ComponentChildren, HTMLAttributes } from "preact";
import { useLayoutEffect, useRef } from "preact/hooks";

interface DialogProps {
  children: ComponentChildren;
  class?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  onClose: () => void;
  onKeyDown?: HTMLAttributes<HTMLDialogElement>["onKeyDown"];
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
  const dialog = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const element = dialog.current!;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element.showModal();
    return () => {
      element.close();
      document.body.style.overflow = previousOverflow;
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      class={className ? `dialog ${className}` : "dialog"}
      aria-label={label}
      aria-labelledby={labelledBy}
      onClose={onClose}
      onKeyDown={onKeyDown}
      onClick={(event) => {
        if (!closeOnBackdrop || event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left || event.clientX > bounds.right ||
          event.clientY < bounds.top || event.clientY > bounds.bottom
        ) dialog.current?.close();
      }}
    >
      {children}
    </dialog>
  );
}
