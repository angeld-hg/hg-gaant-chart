import { AppShell } from "./components/shell/AppShell.tsx";
import { AppProvider } from "./state/store.tsx";

export function appTitle(): string {
  return "Gantt";
}

export function App() {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  );
}
