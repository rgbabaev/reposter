import WaToast from "@awesome.me/webawesome/dist/components/toast/toast.js";

type ToastVariant = "success" | "warning" | "danger";

let toaster: WaToast | undefined;

export function showToast(message: string, variant: ToastVariant = "success") {
  if (!toaster?.isConnected) {
    toaster = new WaToast();
    toaster.placement = "top-end";
    toaster.setAttribute("role", "region");
    toaster.setAttribute("aria-label", "Notifications");
    document.body.append(toaster);
  }
  return toaster.create(message, {
    variant,
    duration: variant === "success" ? 5000 : 0,
  });
}
