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
import Abastecimento from "./pages/Abastecimento";
import Vistorias from "./pages/Vistorias";
import CobrancasDanos from "./pages/admin/CobrancasDanos";
import SolicitacoesVencimento from "./pages/admin/SolicitacoesVencimento";
import EmployeeReservas from "./pages/employee/Reservas";
import EmployeeManutencoes from "./pages/employee/Manutencoes";
import EmployeeAbastecimentos from "./pages/employee/Abastecimentos";
import EmployeeVistorias from "./pages/employee/Vistorias";
import MeusAbastecimentos from "./pages/MeusAbastecimentos";
import SystemSettings from "./pages/SystemSettings";
import RoleRedirect from "./components/RoleRedirect";
import PagamentoDanos from "./pages/PagamentoDanos";
import Mensalidades from "./pages/Mensalidades";
// Pagamentos migrado para BPO Financeiro — mantido apenas para compatibilidade de import
import { useEffect } from "react";
import { useLocation } from "wouter";
import AdminBackups from "./pages/admin/Backups";
import AdminSaas from "./pages/admin/Saas";

function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/redirect"} component={RoleRedirect} />
      <Route path={"/dashboard"} component={Dashboard} />
      <Route path={"/galeria"} component={Galeria} />
      <Route path={"/reservas"} component={Reservas} />
      <Route path={"/acesso-negado"} component={AccessDenied} />
      <Route path={"/admin"} component={Admin} />
      <Route path={"/admin/manutencao"} component={AdminManutencao} />
      <Route path={"/admin/funcionarios"} component={Funcionarios} />
      <Route path={"/admin/abastecimento"} component={Abastecimento} />
      <Route path={"/admin/vistorias"} component={Vistorias} />
      <Route path={"/admin/cobrancas-danos"} component={CobrancasDanos} />
      <Route path={"/admin/solicitacoes-vencimento"} component={SolicitacoesVencimento} />
      <Route path={"/admin/configuracoes"} component={SystemSettings} />
      <Route path={"/admin/pagamentos"} component={() => { const [, nav] = useLocation(); useEffect(() => { nav("/admin/saas"); }, []); return null; }} />
      <Route path={"/admin/backups"} component={AdminBackups} />
      <Route path={"/admin/saas"} component={AdminSaas} />
      <Route path={"/employee/reservas"} component={EmployeeReservas} />
      <Route path={"/employee/manutencoes"} component={EmployeeManutencoes} />
      <Route path={"/employee/abastecimentos"} component={EmployeeAbastecimentos} />
      <Route path={"/employee/vistorias"} component={EmployeeVistorias} />
      <Route path={"/dashboard/meus-abastecimentos"} component={MeusAbastecimentos} />
      <Route path={"/pagamento-danos"} component={PagamentoDanos} />
      <Route path={"/mensalidades"} component={Mensalidades} />
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
