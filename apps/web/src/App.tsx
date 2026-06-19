import { useEffect, useState } from "react";

import { DashboardPage } from "./pages/DashboardPage";
import { LandingPage } from "./pages/LandingPage";
import "./styles.css";

type AppView = "landing" | "dashboard";

function getViewFromLocation(): AppView {
  return window.location.pathname.startsWith("/app") ? "dashboard" : "landing";
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

  return view === "dashboard" ? (
    <DashboardPage onBackToIntro={navigateToLanding} />
  ) : (
    <LandingPage onLaunchApp={navigateToDashboard} />
  );
}
