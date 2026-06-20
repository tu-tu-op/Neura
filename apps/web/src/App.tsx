import { useEffect, useState } from "react";

import { DashboardPage } from "./pages/DashboardPage";
import { LandingPage } from "./pages/LandingPage";
import "./styles.css";
import { AgentBuilderPage } from "./pages/AgentBuilderPage";

type AppView = "landing" | "dashboard" | "builder";

function getViewFromLocation(): AppView {
  return window.location.pathname.startsWith("/agents/new") ? "builder" : window.location.pathname.startsWith("/app") ? "dashboard" : "landing";
}

export default function App() {
  const [view, setView] = useState<AppView>(getViewFromLocation);

  useEffect(() => {
    const handlePopState = () => setView(getViewFromLocation());

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  function navigateToDashboard() {
    if (!window.location.pathname.startsWith("/app")) {
      window.history.pushState(null, "", "/app");
    }

    setView("dashboard");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function navigateToLanding() {
    if (window.location.pathname.startsWith("/app")) {
      window.history.replaceState(null, "", "/");
    }

    setView("landing");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function navigateToBuilder() { window.history.pushState(null, "", "/agents/new"); setView("builder"); window.scrollTo({ top: 0 }); }

  return view === "builder" ? <AgentBuilderPage onBack={navigateToDashboard} /> : view === "dashboard" ? (
    <><DashboardPage onBackToIntro={navigateToLanding} /><button onClick={navigateToBuilder} style={{ position: "fixed", right: 24, bottom: 24, zIndex: 100, padding: "12px 18px", borderRadius: 999 }}>Create agent</button></>
  ) : (
    <LandingPage onLaunchApp={navigateToDashboard} />
  );
}
