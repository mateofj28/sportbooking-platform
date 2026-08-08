"use client";

import { useEffect, useRef, useState } from "react";

type AnimationDirection = "up" | "down" | "left" | "right" | "fade" | "scale";

export function useScrollAnimation(direction: AnimationDirection = "up", delay = 0) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setTimeout(() => setIsVisible(true), delay);
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -50px 0px" }
    );

    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [delay]);

  const baseStyles = "transition-all duration-700 ease-out";

  const hiddenStyles: Record<AnimationDirection, string> = {
    up: "opacity-0 translate-y-8",
    down: "opacity-0 -translate-y-8",
    left: "opacity-0 translate-x-8",
    right: "opacity-0 -translate-x-8",
    fade: "opacity-0",
    scale: "opacity-0 scale-95",
  };

  const className = `${baseStyles} ${isVisible ? "opacity-100 translate-x-0 translate-y-0 scale-100" : hiddenStyles[direction]}`;

  return { ref, className, isVisible };
}
