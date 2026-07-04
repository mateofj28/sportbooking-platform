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
                sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
            },
            animation: {
                "fade-in": "fadeIn 0.3s ease-out",
                "slide-up": "slideUp 0.4s ease-out",
                "slide-in-right": "slideInRight 0.3s ease-out",
                "scale-in": "scaleIn 0.2s ease-out",
                "pulse-soft": "pulseSoft 2s infinite",
            },
            keyframes: {
                fadeIn: {
                    "0%": { opacity: "0" },
                    "100%": { opacity: "1" },
                },
                slideUp: {
                    "0%": { opacity: "0", transform: "translateY(12px)" },
                    "100%": { opacity: "1", transform: "translateY(0)" },
                },
                slideInRight: {
                    "0%": { opacity: "0", transform: "translateX(-12px)" },
                    "100%": { opacity: "1", transform: "translateX(0)" },
                },
                scaleIn: {
                    "0%": { opacity: "0", transform: "scale(0.95)" },
                    "100%": { opacity: "1", transform: "scale(1)" },
                },
                pulseSoft: {
                    "0%, 100%": { opacity: "1" },
                    "50%": { opacity: "0.7" },
                },
            },
        },
    },
    darkMode: "class",
    plugins: [
        heroui({
            themes: {
                light: {
                    colors: {
                        background: "#FAFBFC",
                        foreground: "#1A1D23",
                        primary: {
                            50: "#EEF6FF",
                            100: "#D9EBFF",
                            200: "#BCD9FF",
                            300: "#8EC2FF",
                            400: "#59A0FF",
                            500: "#3B82F6",
                            600: "#2563EB",
                            700: "#1D4ED8",
                            800: "#1E40AF",
                            900: "#1E3A8A",
                            DEFAULT: "#3B82F6",
                            foreground: "#FFFFFF",
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
                    },
                },
                dark: {
                    colors: {
                        background: "#0F1117",
                        foreground: "#E8EAED",
                        primary: {
                            DEFAULT: "#60A5FA",
                            foreground: "#0F1117",
                        },
                        secondary: {
                            DEFAULT: "#A78BFA",
                            foreground: "#0F1117",
                        },
                    },
                },
            },
        }),
    ],
};

export default config;
