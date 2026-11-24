import type { ComponentType, SVGProps } from "react";

/** Tipo de un ícono de Heroicons (o cualquier componente SVG): acepta className, aria-hidden, etc. */
export type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { title?: string; titleId?: string }>;
