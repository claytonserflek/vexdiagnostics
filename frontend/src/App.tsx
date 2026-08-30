import { useCallback, useEffect, useState } from "react";
import "./index.css";
import { listTests } from "./api";
import type { TestDetailResponse, TestListItem } from "./types";
import { AppShell, type NavKey } from "./components/AppShell";
import { OverviewPage } from "./pages/OverviewPage";
import { RunDiagnosticPage } from "./pages/RunDiagnosticPage";
import { DiagnosticResultsPage } from "./pages/DiagnosticResultsPage";
import { TestHistoryPage } from "./pages/TestHistoryPage";
import { CompareTestsPage } from "./pages/CompareTestsPage";
import { RobotSetupPage } from "./pages/RobotSetupPage";
import { SettingsPage } from "./pages/SettingsPage";
import { applyTheme, getStoredTheme, type ThemePreference } from "./theme";

type Route =
  | { page: "overview" }
  | { page: "run" }
  | { page: "results"; testId: number }
  | { page: "history" }
  | { page: "compare"; beforeId?: number }
  | { page: "setup" }
  | { page: "settings" };

const NAV_TITLE: Record<NavKey, string> = {
  overview: "Overview",
  run: "Run Diagnostic",
  history: "Test History",
  compare: "Compare Tests",
  setup: "Robot Setup",
  settings: "Settings",
};

function routeToNavKey(route: Route): NavKey {
  if (route.page === "results") return "history";
  return route.page;
}

export default function App() {
  const [route, setRoute] = useState<Route>({ page: "overview" });
  const [tests, setTests] = useState<TestListItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemePreference>(getStoredTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const refreshTests = useCallback(() => {
    listTests()
      .then(setTests)
      .catch((e) => setLoadError(String(e)));
  }, []);

  useEffect(() => {
    refreshTests();
  }, [refreshTests]);

  function handleImported(result: TestDetailResponse) {
    refreshTests();
    setRoute({ page: "results", testId: result.test.id });
  }

  return (
    <AppShell active={routeToNavKey(route)} onNavigate={(key) => setRoute({ page: key })} mobileTitle={NAV_TITLE[routeToNavKey(route)]}>
      {loadError && <div className="notice error">{loadError}</div>}

      {route.page === "overview" && (
        <OverviewPage tests={tests} onRunDiagnostic={() => setRoute({ page: "run" })} onOpenTest={(id) => setRoute({ page: "results", testId: id })} />
      )}

      {route.page === "run" && <RunDiagnosticPage onComplete={handleImported} />}

      {route.page === "results" && (
        <DiagnosticResultsPage
          testId={route.testId}
          onBack={() => setRoute({ page: "history" })}
          onCompare={(id) => setRoute({ page: "compare", beforeId: id })}
        />
      )}

      {route.page === "history" && (
        <TestHistoryPage
          tests={tests}
          onOpenTest={(id) => setRoute({ page: "results", testId: id })}
          onRunDiagnostic={() => setRoute({ page: "run" })}
        />
      )}

      {route.page === "compare" && (
        <CompareTestsPage key={route.beforeId ?? "none"} tests={tests} initialBeforeId={route.beforeId} />
      )}

      {route.page === "setup" && <RobotSetupPage />}

      {route.page === "settings" && <SettingsPage theme={theme} onThemeChange={setTheme} />}
    </AppShell>
  );
}
