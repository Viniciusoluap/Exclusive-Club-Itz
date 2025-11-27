import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import WhatsAppButton from "./components/WhatsAppButton";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import Galeria from "./pages/Galeria";
import Reservas from "./pages/Reservas";
import AccessDenied from "./pages/AccessDenied";
import Admin from "./pages/Admin";
import AdminManutencao from "./pages/AdminManutencao";
import Funcionarios from "./pages/Funcionarios";

function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/dashboard"} component={Dashboard} />
      <Route path={"/galeria"} component={Galeria} />
      <Route path={"/reservas"} component={Reservas} />
      <Route path={"/acesso-negado"} component={AccessDenied} />
      <Route path={"/admin"} component={Admin} />
      <Route path={"/admin/manutencao"} component={AdminManutencao} />
      <Route path={"/admin/funcionarios"} component={Funcionarios} />
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
        // switchable
      >
        <TooltipProvider>
          <Toaster />
          <Router />
          <WhatsAppButton />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
