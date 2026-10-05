import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { ActorProvider } from "./actor.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <ActorProvider>
      <App />
    </ActorProvider>
  </BrowserRouter>
);
