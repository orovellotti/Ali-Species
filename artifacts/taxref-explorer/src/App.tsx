import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HelmetProvider } from "react-helmet-async";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import TaxonDetail from "@/pages/taxon";
import About from "@/pages/about";
import Taxonomie from "@/pages/taxonomie";
import Sources from "@/pages/sources";
import ExportPage from "@/pages/export";
import AiAgentsPage from "@/pages/ai-agents";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 5,
    },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/taxonomie" component={Taxonomie} />
      <Route path="/sources" component={Sources} />
      <Route path="/export" component={ExportPage} />
      <Route path="/ai-agents" component={AiAgentsPage} />
      <Route path="/a-propos" component={About} />
      <Route path="/taxon/:slug" component={TaxonDetail} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </HelmetProvider>
  );
}

export default App;
