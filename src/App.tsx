import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import Index from "./pages/Index.tsx";
import Login from "./pages/Login.tsx";
import AdminPanel from "./pages/AdminPanel.tsx";
import Upgrade from "./pages/Upgrade.tsx";
import PendingApproval from "./pages/PendingApproval.tsx";
import NotFound from "./pages/NotFound.tsx";
import ResetPassword from "./pages/ResetPassword.tsx";
import ResetPasswordConfirm from "./pages/ResetPasswordConfirm.tsx";
import MyAccount from "./pages/MyAccount.tsx";
import Termos from "./pages/Termos.tsx";
import Privacidade from "./pages/Privacidade.tsx";
import { PlanSelection } from "./components/PlanSelection.tsx";
import CookieConsent from "./components/CookieConsent.tsx";
import { Loader2 } from "lucide-react";

const queryClient = new QueryClient();

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, loading, profile } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!session) return <Navigate to="/login" replace />;

  // Check approval (profile might still be loading)
  if (profile && !profile.approved) return <PendingApproval />;

  // Force plan selection before accessing app
  if (profile && profile.approved && !profile.plan_selected) return <PlanSelection />;

  return <>{children}</>;
};

const PublicRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, loading } = useAuth();
  if (loading) return null;
  if (session) return <Navigate to="/" replace />;
  return <>{children}</>;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <CookieConsent />
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
            <Route path="/reset-password" element={<PublicRoute><ResetPassword /></PublicRoute>} />
            <Route path="/reset-password-confirm" element={<ResetPasswordConfirm />} />
            <Route path="/minha-conta" element={<ProtectedRoute><MyAccount /></ProtectedRoute>} />
            <Route path="/termos" element={<Termos />} />
            <Route path="/privacidade" element={<Privacidade />} />
            <Route path="/admin" element={<ProtectedRoute><AdminPanel /></ProtectedRoute>} />
            <Route path="/upgrade" element={<ProtectedRoute><Upgrade /></ProtectedRoute>} />
            <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
