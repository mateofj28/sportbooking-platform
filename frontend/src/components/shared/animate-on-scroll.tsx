"use client";

import { useAnimateOnScroll } from "@/hooks/use-animate-on-scroll";

type Direction = "up" | "down" | "left" | "right" | "fade" | "scale" | "bounce";

const DIRECTION_TO_CLASS: Record<Direction, string> = {
  up: "animate-slide-up",
  down: "animate-slide-up",
  left: "animate-slide-in-left",
  right: "animate-slide-in-right",
  fade: "animate-fade-in",
  scale: "animate-scale-in",
  bounce: "animate-bounce-in",
};

interface AnimateOnScrollProps {
  children: React.ReactNode;
  direction?: Direction;
  animation?: string;
  delay?: number;
  className?: string;
}

export function AnimateOnScroll({
  children,
  direction = "up",
  animation,
  delay = 0,
  className = "",
}: AnimateOnScrollProps) {
  const { ref, isVisible } = useAnimateOnScroll(0.1);
  const animClass = animation ? `animate-${animation}` : DIRECTION_TO_CLASS[direction];

  return (
    <div
      ref={ref}
      className={`${isVisible ? animClass : "opacity-0"} ${className}`}
      style={{ animationDelay: `${delay}ms`, animationFillMode: "forwards" }}
    >
      {children}
    </div>
  );
}
