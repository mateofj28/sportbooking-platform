"use client";

import { useToastStore } from "@/stores/toast-store";
import { CheckCircle2, XCircle, Info, X } from "lucide-react";

const ICONS = {
  success: <CheckCircle2 className="h-4 w-4 text-success" />,
  error: <XCircle className="h-4 w-4 text-danger" />,
  info: <Info className="h-4 w-4 text-primary" />,
};

const BG = {
  success: "bg-success-50 border-success-200 dark:bg-success-50/10 dark:border-success/30",
  error: "bg-danger-50 border-danger-200 dark:bg-danger-50/10 dark:border-danger/30",
  info: "bg-primary-50 border-primary-200 dark:bg-primary-50/10 dark:border-primary/30",
};

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`flex items-center gap-3 rounded-lg border px-4 py-3 shadow-lg animate-slide-up ${BG[toast.type]}`}
        >
          {ICONS[toast.type]}
          <p className="flex-1 text-sm font-medium text-foreground">{toast.message}</p>
          <button onClick={() => removeToast(toast.id)} className="text-default-400 hover:text-default-600">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
