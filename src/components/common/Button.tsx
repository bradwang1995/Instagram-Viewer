import clsx from "clsx";
import type { ButtonHTMLAttributes, PropsWithChildren } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

type ButtonProps = PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
  }
>;

export function Button({
  children,
  className,
  variant = "secondary",
  ...props
}: ButtonProps) {
  return (
    <button className={clsx("button", `button-${variant}`, className)} {...props}>
      {children}
    </button>
  );
}
