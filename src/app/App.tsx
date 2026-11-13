import { Outlet } from "react-router-dom";
import { AppShell } from "../components/layout/AppShell";
import { MonetizationGate } from "../features/monetization";

export function App() {
  return (
    <AppShell>
      <MonetizationGate>
        <Outlet />
      </MonetizationGate>
    </AppShell>
  );
}
