import { useLayoutEffect, useRef } from "preact/hooks";
import type WaButton from "@awesome.me/webawesome/dist/components/button/button.js";
import type { HTMLAttributes, RefObject } from "preact";
import "@awesome.me/webawesome/dist/styles/themes/default.css";
import "@awesome.me/webawesome/dist/components/button/button.js";
import "@awesome.me/webawesome/dist/components/input/input.js";
import "@awesome.me/webawesome/dist/components/select/select.js";
import "@awesome.me/webawesome/dist/components/checkbox/checkbox.js";
import "@awesome.me/webawesome/dist/components/switch/switch.js";
import "@awesome.me/webawesome/dist/components/card/card.js";
import "@awesome.me/webawesome/dist/components/badge/badge.js";
import "@awesome.me/webawesome/dist/components/tag/tag.js";
import "@awesome.me/webawesome/dist/components/callout/callout.js";
import "@awesome.me/webawesome/dist/components/spinner/spinner.js";
import "@awesome.me/webawesome/dist/components/dialog/dialog.js";

type ComponentTag =
  | "wa-button"
  | "wa-input"
  | "wa-select"
  | "wa-option"
  | "wa-checkbox"
  | "wa-switch"
  | "wa-card"
  | "wa-badge"
  | "wa-tag"
  | "wa-callout"
  | "wa-spinner"
  | "wa-dialog";

type ComponentAttributes<T extends HTMLElement> = HTMLAttributes<T> &
  Partial<Omit<T, keyof HTMLAttributes<T>>>;
type WebAwesomeElements = {
  [Tag in ComponentTag]: ComponentAttributes<HTMLElementTagNameMap[Tag]>;
};

declare module "preact" {
  namespace JSX {
    interface IntrinsicElements extends WebAwesomeElements {}
  }
}

export function Button({
  elementRef,
  variant = "neutral",
  appearance = "outlined",
  type = "button",
  ...props
}: ComponentAttributes<WaButton> & {
  elementRef?: RefObject<WaButton | null>;
}) {
  const button = useRef<WaButton>(null);
  const forwarded = useRef<string[]>([]);
  useLayoutEffect(() => {
    const element = button.current!;
    let cancelled = false;
    void element.updateComplete.then(() => {
      if (cancelled) return;
      for (const name of forwarded.current)
        element.button.removeAttribute(name);
      forwarded.current = [];
      for (const [name, value] of Object.entries(props)) {
        if (name.startsWith("aria-") && value !== undefined && value !== null) {
          element.button.setAttribute(name, String(value));
          forwarded.current.push(name);
        }
      }
    });
    return () => {
      cancelled = true;
    };
  });
  return (
    <wa-button
      {...props}
      variant={variant}
      appearance={appearance}
      type={type}
      ref={(element) => {
        button.current = element;
        if (elementRef) elementRef.current = element;
      }}
    />
  );
}
