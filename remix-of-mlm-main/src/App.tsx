import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

// Lazy-loaded routes for code splitting
const Register = lazy(() => import("./pages/Register"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Admin = lazy(() => import("./pages/Admin"));
const Legal = lazy(() => import("./pages/Legal"));
const Contact = lazy(() => import("./pages/Contact"));
const AccountingDashboard = lazy(() => import("./pages/AccountingDashboard"));
const SecurityDashboard = lazy(() => import("./pages/SecurityDashboard"));
const SecurityTest = lazy(() => import("./pages/SecurityTest"));
const PromoDisplay = lazy(() => import("./pages/PromoDisplay"));
const CallCenterDashboard = lazy(() => import("./pages/CallCenterDashboard"));
const MLMDashboard = lazy(() => import("./pages/MLMDashboard"));
const Portal = lazy(() => import("./pages/Portal"));
const CRMDashboard = lazy(() => import("./pages/CRMDashboard"));
const BrokerDashboard = lazy(() => import("./pages/BrokerDashboard"));
const AIChatWidget = lazy(() => import("@/components/chat/AIChatWidget").then(m => ({ default: m.AIChatButton })));

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <LanguageProvider>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <ErrorBoundary>
            <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>}>
            <Routes>
              {/* Public routes */}
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/register" element={<Register />} />
              <Route path="/contact" element={<Contact />} />
              <Route path="/legal/:type" element={<Legal />} />
              <Route path="/promo-display" element={<PromoDisplay />} />
              <Route path="/p/:portalSlug" element={<Portal />} />

              {/* Authenticated routes */}
              <Route path="/dashboard" element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              } />

              {/* Admin-only routes */}
              <Route path="/admin" element={
                <ProtectedRoute requiredRoles={['admin', 'super_admin']}>
                  <Admin />
                </ProtectedRoute>
              } />
              <Route path="/accounting" element={
                <ProtectedRoute requiredRoles={['admin', 'super_admin']}>
                  <AccountingDashboard />
                </ProtectedRoute>
              } />
              <Route path="/security-dashboard" element={
                <ProtectedRoute requiredRoles={['admin', 'super_admin']}>
                  <SecurityDashboard />
                </ProtectedRoute>
              } />
              <Route path="/security-test" element={
                <ProtectedRoute>
                  <SecurityTest />
                </ProtectedRoute>
              } />
              <Route path="/callcenter" element={
                <ProtectedRoute requiredRoles={['admin', 'super_admin', 'callcenter']}>
                  <CallCenterDashboard />
                </ProtectedRoute>
              } />
              <Route path="/broker" element={
                <ProtectedRoute requiredRoles={['cc_broker', 'admin', 'super_admin']}>
                  <BrokerDashboard />
                </ProtectedRoute>
              } />
              {/* MLM has its own login gate (MLMLoginScreen) — ProtectedRoute would redirect to /auth and break its custom flow */}
              <Route path="/mlm" element={<MLMDashboard />} />
              <Route path="/crm" element={
                <ProtectedRoute>
                  <CRMDashboard />
                </ProtectedRoute>
              } />

              <Route path="*" element={<NotFound />} />
            </Routes>
            <Suspense fallback={null}>
              <AIChatWidget />
            </Suspense>
            </Suspense>
            </ErrorBoundary>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </LanguageProvider>
  </QueryClientProvider>
);

export default App;
