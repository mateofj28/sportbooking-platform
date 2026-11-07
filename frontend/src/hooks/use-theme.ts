"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

/** Lee el tema desde localStorage o la preferencia del sistema.
 *  Se ejecuta en el cliente — no en SSR. */
function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";
    const stored = localStorage.getItem("theme") as Theme | null;
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(t: Theme) {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(t);
}

export function useTheme() {
  // Inicialización lazy: lee localStorage en el primer render del cliente.
  // Evita el ciclo mounted:false→true que causaba parpadeo en el Popover.
  const [theme, setTheme] = useState<Theme>(() => {
    const t = getInitialTheme();
    // Aplicar inmediatamente para evitar flash de tema incorrecto
    if (typeof window !== "undefined") applyTheme(t);
    return t;
  });

  // Sincronizar con el DOM al montar (por si el HTML del servidor difiere)
  useEffect(() => {
    applyTheme(theme);
  }, []);

  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    localStorage.setItem("theme", next);
    applyTheme(next);
  };

  // mounted siempre true — ya no hay estado de carga pendiente
  return { theme, toggleTheme, isDark: theme === "dark", mounted: true };
}
