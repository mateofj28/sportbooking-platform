import { create } from "zustand";
import { translateError } from "@/lib/error-messages";

export interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info";
}

interface ToastState {
  toasts: Toast[];
  addToast: (message: string, type?: Toast["type"]) => void;
  removeToast: (id: string) => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  addToast: (raw, type = "success") => {
    // Red de seguridad: si el texto llega en inglés (error de Supabase o del navegador), traducirlo
    // (Muchas pantallas muestran errores sin pasar type "error": se traduce siempre;
    //  lo que ya está en español queda igual.)
    const message = translateError(raw);
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    set((state) => ({ toasts: [...state.toasts, { id, message, type }] }));
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    }, 4000);
  },
  removeToast: (id) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },
}));
