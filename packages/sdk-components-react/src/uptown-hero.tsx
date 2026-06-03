import {
  forwardRef,
  createElement,
  type ElementRef,
  type ComponentProps,
} from "react";

type Props = ComponentProps<"section">;

export const UptownHero = forwardRef<ElementRef<"section">, Props>(
  (props, ref) => createElement("section", { ...props, ref })
);

UptownHero.displayName = "UptownHero";
