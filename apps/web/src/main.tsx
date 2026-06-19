import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import { SuiProviders } from "./lib/sui/providers";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <SuiProviders>
      <App />
    </SuiProviders>
  </React.StrictMode>
);
