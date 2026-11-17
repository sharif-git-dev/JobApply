import { Shell } from "@/components/Shell";
import { AccountGate } from "@/components/AccountGate";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return <AccountGate><Shell>{children}</Shell></AccountGate>;
}
