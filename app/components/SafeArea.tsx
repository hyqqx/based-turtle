import { ReactNode } from "react";

interface SafeAreaProps {
  children: ReactNode;
  className?: string;
}

/* Plain CSS safe-area padding: works in any browser and in the
   Base App in-app browser, no SDK required. */
export function SafeArea({ children, className }: SafeAreaProps) {
  return (
    <div
      className={className}
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
      }}
    >
      {children}
    </div>
  );
}
