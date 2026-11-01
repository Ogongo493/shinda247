import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/auth-context";
import { RtdbProvider } from "@/contexts/rtdb-context";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import Home from "@/pages/home";
import LoginPage from "@/pages/login";
import RegisterPage from "@/pages/register";
import AdminPage from "@/pages/admin";
import HistoryPage from "@/pages/history";
import PlayersPage from "@/pages/players";
import NotificationsPage from "@/pages/notifications";
import FAQPage from "@/pages/faq";
import NotFound from "@/pages/not-found";
import { useEffect } from "react";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div className="min-h-screen bg-background flex items-center justify-center"><div className="text-muted-foreground">Loading...</div></div>;
  if (!user) return <Redirect to="/login" />;
  return <Component />;
}

function PlayerRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div className="min-h-screen bg-background flex items-center justify-center"><div className="text-muted-foreground">Checking player access...</div></div>;
  if (!user) return <Redirect to="/login" />;
  if (user.isAdmin) return <Redirect to="/admin" />;
  return <Component />;
}

function AdminRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div className="min-h-screen bg-background flex items-center justify-center"><div className="text-muted-foreground">Checking administrator access...</div></div>;
  if (!user) return <Redirect to="/login" />;
  if (!user.isAdmin) return <Redirect to="/" />;
  return <Component />;
}

function HomeRoute() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div className="min-h-screen bg-background flex items-center justify-center"><div className="text-muted-foreground">Loading...</div></div>;
  if (!user) return <Redirect to="/login" />;
  if (user.isAdmin) return <Redirect to="/admin" />;
  return <Home />;
}

function GuestRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (user) return <Redirect to={user.isAdmin ? "/admin" : "/"} />;
  return <Component />;
}

function AuthTokenWirer() {
  const { token } = useAuth();
  useEffect(() => {
    setAuthTokenGetter(() => token);
  }, [token]);
  return null;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={() => <GuestRoute component={LoginPage} />} />
      <Route path="/register" component={() => <GuestRoute component={RegisterPage} />} />
      <Route path="/admin" component={() => <AdminRoute component={AdminPage} />} />
      <Route path="/" component={HomeRoute} />
      <Route path="/history" component={() => <PlayerRoute component={HistoryPage} />} />
      <Route path="/players" component={() => <PlayerRoute component={PlayersPage} />} />
      <Route path="/notifications" component={() => <PlayerRoute component={NotificationsPage} />} />
      <Route path="/faq" component={() => <PlayerRoute component={FAQPage} />} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <AuthTokenWirer />
          <RtdbProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <Router />
            </WouterRouter>
            <Toaster />
          </RtdbProvider>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
