import { create } from "zustand";

/**
 * Estado del drawer del panel admin en móvil.
 * El botón de abrir vive en el navbar (arriba a la izquierda) y el drawer
 * se renderiza en el AdminSidebar; ambos comparten este estado.
 */
interface SidebarState {
    mobileOpen: boolean;
    open: () => void;
    close: () => void;
    toggle: () => void;
}

export const useSidebarStore = create<SidebarState>((set) => ({
    mobileOpen: false,
    open: () => set({ mobileOpen: true }),
    close: () => set({ mobileOpen: false }),
    toggle: () => set((s) => ({ mobileOpen: !s.mobileOpen })),
}));
