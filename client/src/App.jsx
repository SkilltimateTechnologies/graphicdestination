import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./AuthContext";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Editor from "./pages/Editor";
import Dashboard from "./pages/Dashboard";
import Settings from "./pages/Settings";
import Templates from "./pages/Templates";
import PublicPlayer from "./pages/PublicPlayer";

function ProtectedRoute({ children }) {
  const { user } = useAuth();
  if (user === undefined) return <Loading />;
  if (user === null) return <Navigate to="/login" replace />;
  return children;
}

function Loading() {
  return (
    <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0A0C10", color: "#939BAD", fontFamily: "Inter, system-ui, sans-serif", fontSize: 13, letterSpacing: "0.01em" }}>
      Checking session…
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          {/* PUBLIC share-link player — deliberately outside ProtectedRoute */}
          <Route path="/p/:token" element={<PublicPlayer />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/templates"
            element={
              <ProtectedRoute>
                <Templates />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <Settings />
              </ProtectedRoute>
            }
          />
          <Route
            path="/editor"
            element={
              <ProtectedRoute>
                <Editor />
              </ProtectedRoute>
            }
          />
          <Route
            path="/editor/:id"
            element={
              <ProtectedRoute>
                <Editor />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
