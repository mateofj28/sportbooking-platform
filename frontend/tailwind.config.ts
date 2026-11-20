import { heroui } from "@heroui/theme";
import type { Config } from "tailwindcss";

const config: Config = {
    content: [
        "./src/**/*.{js,ts,jsx,tsx,mdx}",
        "./node_modules/@heroui/theme/dist/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ["Plus Jakarta Sans", "system-ui", "-apple-system", "sans-serif"],
            },
            animation: {
                "fade-in": "fadeIn 0.5s ease-out forwards",
                "slide-up": "slideUp 0.6s ease-out forwards",
                "slide-in-right": "slideInRight 0.6s ease-out forwards",
                "slide-in-left": "slideInLeft 0.6s ease-out forwards",
                "scale-in": "scaleIn 0.4s ease-out forwards",
                "pulse-soft": "pulseSoft 2s infinite",
                "bounce-in": "bounceIn 0.6s ease-out forwards",
            },
            keyframes: {
                fadeIn: {
                    "0%": { opacity: "0" },
                    "100%": { opacity: "1" },
                },
                slideUp: {
                    "0%": { opacity: "0", transform: "translateY(40px)" },
                    "100%": { opacity: "1", transform: "translateY(0)" },
                },
                slideInRight: {
                    "0%": { opacity: "0", transform: "translateX(60px)" },
                    "100%": { opacity: "1", transform: "translateX(0)" },
                },
                slideInLeft: {
                    "0%": { opacity: "0", transform: "translateX(-60px)" },
                    "100%": { opacity: "1", transform: "translateX(0)" },
                },
                scaleIn: {
                    "0%": { opacity: "0", transform: "scale(0.8)" },
                    "100%": { opacity: "1", transform: "scale(1)" },
                },
                pulseSoft: {
                    "0%, 100%": { opacity: "1" },
                    "50%": { opacity: "0.7" },
                },
                bounceIn: {
                    "0%": { opacity: "0", transform: "scale(0.3)" },
                    "50%": { transform: "scale(1.05)" },
                    "70%": { transform: "scale(0.95)" },
                    "100%": { opacity: "1", transform: "scale(1)" },
                },
            },
        },
    },
    darkMode: "class",
    plugins: [
        heroui({
            themes: {
                light: {
                    layout: {
                        boxShadow: {
                            small: "none",
                            medium: "none",
                            large: "none",
                        },
                    },
                    // Paleta del modo claro: ver .kiro/steering/diseno.md ("Tema y colores")
                    colors: {
                        background: "#FFFFFF",   // fondo general de la página
                        foreground: "#111111",   // títulos y texto principal
                        content1: "#F6F6F6",     // fondo de las tarjetas = lab(97 0.02 0)
                        divider: "#E5E5E5",      // líneas divisorias
                        primary: {
                            50: "#EEF2FD",
                            100: "#DCE4FA",
                            200: "#B9C9F5",
                            300: "#8DA6EE",
                            400: "#5F7FE3",
                            500: "#2F54D6",
                            600: "#2644B3",
                            700: "#1F3790",
                            800: "#182B6F",
                            900: "#121F50",
                            DEFAULT: "#2F54D6",  // botones principales
                            foreground: "#FFFFFF", // texto sobre botones
                        },
                        secondary: {
                            50: "#F5F3FF",
                            100: "#EDE9FE",
                            200: "#DDD6FE",
                            300: "#C4B5FD",
                            400: "#A78BFA",
                            500: "#8B5CF6",
                            600: "#7C3AED",
                            700: "#6D28D9",
                            800: "#5B21B6",
                            900: "#4C1D95",
                            DEFAULT: "#8B5CF6",
                            foreground: "#FFFFFF",
                        },
                        success: {
                            50: "#ECFDF5",
                            100: "#D1FAE5",
                            200: "#A7F3D0",
                            300: "#6EE7B7",
                            400: "#34D399",
                            500: "#10B981",
                            600: "#059669",
                            700: "#047857",
                            DEFAULT: "#10B981",
                            foreground: "#FFFFFF",
                        },
                        warning: {
                            50: "#FFFBEB",
                            100: "#FEF3C7",
                            200: "#FDE68A",
                            300: "#FCD34D",
                            400: "#FBBF24",
                            500: "#F59E0B",
                            600: "#D97706",
                            DEFAULT: "#F59E0B",
                            foreground: "#FFFFFF",
                        },
                        danger: {
                            50: "#FEF2F2",
                            100: "#FEE2E2",
                            200: "#FECACA",
                            300: "#FCA5A5",
                            400: "#F87171",
                            500: "#EF4444",
                            600: "#DC2626",
                            DEFAULT: "#EF4444",
                            foreground: "#FFFFFF",
                        },
                        default: {
                            50: "#f8fafc",
                            100: "#f1f5f9",
                            200: "#e2e8f0",
                            300: "#cbd5e1",
                            400: "#94a3b8",
                            500: "#6B6B6B",      // texto secundario (text-default-500)
                            600: "#475569",
                            700: "#334155",
                            800: "#1e293b",
                            900: "#0f172a",
                            DEFAULT: "#64748b",
                            foreground: "#111111",
                        },
                    },
                },
                dark: {
                    layout: {
                        boxShadow: {
                            small: "none",
                            medium: "none",
                            large: "none",
                        },
                    },
                    colors: {
                        background: "#1f1f21",
                        foreground: "#E8EAED",
                        primary: {
                            DEFAULT: "#60A5FA",
                            foreground: "#1f1f21",
                        },
                        secondary: {
                            DEFAULT: "#A78BFA",
                            foreground: "#1f1f21",
                        },
                    },
                },
            },
        }),
    ],
};

export default config;
