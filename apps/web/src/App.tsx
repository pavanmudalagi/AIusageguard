import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import EndpointsPage from "./pages/EndpointsPage";
import EndpointDetailsPage from "./pages/EndpointDetailsPage";
import GenAIAppsPage from "./pages/GenAIAppsPage";
import GenAIAppDetailsPage from "./pages/GenAIAppDetailsPage";
import RiskEventsPage from "./pages/RiskEventsPage";
import ActivityEventsPage from "./pages/ActivityEventsPage";
import PoliciesPage from "./pages/PoliciesPage";
import PolicyEditorPage from "./pages/PolicyEditorPage";
import PolicyDetailsPage from "./pages/PolicyDetailsPage";
import EducationPage from "./pages/EducationPage";
import SettingsPage from "./pages/SettingsPage";
import BrowserPluginPage from "./pages/BrowserPluginPage";
import AlertsPage from "./pages/AlertsPage";
import TemplatesPage from "./pages/TemplatesPage";

function Protected({ children }: { children: JSX.Element }) {
  return localStorage.getItem("aiug_token") ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<Protected><Layout /></Protected>}>
        <Route index element={<DashboardPage />} />
        <Route path="/endpoints" element={<EndpointsPage />} />
        <Route path="/endpoints/:id" element={<EndpointDetailsPage />} />
        <Route path="/genai-apps" element={<GenAIAppsPage />} />
        <Route path="/genai-apps/:id" element={<GenAIAppDetailsPage />} />
        <Route path="/risk-events" element={<RiskEventsPage />} />
        <Route path="/activity-events" element={<ActivityEventsPage />} />
        <Route path="/policies" element={<PoliciesPage />} />
        <Route path="/policies/new" element={<PolicyEditorPage />} />
        <Route path="/policies/:id" element={<PolicyDetailsPage />} />
        <Route path="/policies/:id/edit" element={<PolicyEditorPage />} />
        <Route path="/browser-plugin" element={<BrowserPluginPage />} />
        <Route path="/browser-plugin/updates" element={<BrowserPluginPage />} />
        <Route path="/alerts" element={<AlertsPage />} />
        <Route path="/templates" element={<TemplatesPage />} />
        <Route path="/education" element={<EducationPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}
