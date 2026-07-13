import "./global.css";
import { createRoot } from "react-dom/client";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";

import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import SiteHeader from "./components/layout/SiteHeader";
import OfferBank from "./pages/OfferBank";
import PromotionAnalysis from "./pages/PromotionAnalysis";
import SavedFilters from "./pages/savedFilters";
import Login from "./pages/Login";
import VerifyOtp from "./pages/VerifyOtp";

import { FilterProvider } from "./pages/FilterContex";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { LayoutProvider, useLayout } from "./context/LayoutContext"; // [MODIFIED] Import context
import { ThemeProvider } from "./context/ThemeContext";

const queryClient = new QueryClient();

// === Protected Route ===
const ProtectedRoute = ({ children }: { children: JSX.Element }) => {
  const { session, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center min-h-screen text-xl">Loading...</div>;
  return session ? children : <Navigate to="/login" replace />;
};

// === SMART REDIRECT: Only from /login or /verify-otp ===
const SmartRedirect = () => {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  if (isAuthenticated && (location.pathname === '/login' || location.pathname === '/verify-otp')) {
    window.location.replace('/');
  }
  return null;
};

// === [MODIFIED] Main App Layout ===
const MainApp = () => {
  // Get the sidebar content from the context
  const { sidebarNode } = useLayout();

  return (
    <FilterProvider>
      <div className="min-h-screen bg-background text-foreground">
        <SiteHeader />

        {/* NEW LAYOUT: This flex container creates the two-column layout */}
        <div className="flex w-full">

          {/* COLUMN 1: STICKY SIDEBAR 
            This sidebar is rendered on the far left, outside the centered container.
          */}
          {sidebarNode && (
            <aside
              className="
                w-[280px] flex-shrink-0 p-4 md:p-6 
                sticky top-6 self-start 
                max-h-[calc(100vh-48px)] overflow-y-auto 
                scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-zinc-900 scrollbar-thumb-rounded-full
              "
              style={{ top: '1.5rem' }}
            >
              {sidebarNode}
            </aside>
          )}

          {/* COLUMN 2: MAIN CONTENT 
            This 'container' class centers the main content area (top filters + products).
            'flex-1' ensures it takes up the remaining space.
          */}
          <main className="container py-8 flex-1 min-w-0"> {/* Added min-w-0 */}
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/offer-bank" element={<OfferBank />} />
              <Route path="/promotion-analysis" element={<PromotionAnalysis />} />
              <Route path="/saved-filters" element={<SavedFilters />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </main>
        </div>
      </div>
    </FilterProvider>
  );
};


// === Root Router ===
const Root = () => (
  <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <SmartRedirect />
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/verify-otp" element={<VerifyOtp />} />
      <Route path="/unauthorized" element={<div className="p-8 text-center">Access denied</div>} />
      <Route path="/*" element={<ProtectedRoute><MainApp /></ProtectedRoute>} />
    </Routes>
  </BrowserRouter>
);

// === [MODIFIED] Final App ===
const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <ThemeProvider>
        <AuthProvider>
          {/* We must wrap the app in LayoutProvider so MainApp and OfferBank can share state */}
          <LayoutProvider>
            <Root />
          </LayoutProvider>
        </AuthProvider>
      </ThemeProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

createRoot(document.getElementById("root")!).render(<App />);