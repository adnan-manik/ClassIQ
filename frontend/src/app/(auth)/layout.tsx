import { ReactNode } from "react";

/** Auth-route layout — bare; pages own their own background. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
