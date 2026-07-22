import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ConfirmProvider } from "@/hooks/useConfirm";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import ProtectedRoute from "./components/ProtectedRoute";
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
      <Route path={"/admin"} component={() => <ProtectedRoute component={Admin} allowedRoles={["admin"]} />} />
      <Route path={"/admin/manutencao"} component={() => <ProtectedRoute component={AdminManutencao} allowedRoles={["admin"]} />} />
      <Route path={"/admin/funcionarios"} component={() => <ProtectedRoute component={Funcionarios} allowedRoles={["admin"]} />} />
      <Route path={"/admin/abastecimento"} component={() => <ProtectedRoute component={Abastecimento} allowedRoles={["admin"]} />} />
      <Route path={"/admin/vistorias"} component={() => <ProtectedRoute component={Vistorias} allowedRoles={["admin"]} />} />
      <Route path={"/admin/cobrancas-danos"} component={() => <ProtectedRoute component={CobrancasDanos} allowedRoles={["admin"]} />} />
      <Route path={"/admin/solicitacoes-vencimento"} component={() => <ProtectedRoute component={SolicitacoesVencimento} allowedRoles={["admin"]} />} />
      <Route path={"/admin/configuracoes"} component={() => <ProtectedRoute component={SystemSettings} allowedRoles={["admin"]} />} />
      <Route path={"/admin/pagamentos"} component={() => { const [, nav] = useLocation(); useEffect(() => { nav("/admin/saas"); }, []); return null; }} />
      <Route path={"/admin/backups"} component={() => <ProtectedRoute component={AdminBackups} allowedRoles={["admin"]} />} />
      <Route path={"/admin/saas"} component={() => <ProtectedRoute component={AdminSaas} allowedRoles={["admin"]} />} />
      <Route path={"/employee/reservas"} component={() => <ProtectedRoute component={EmployeeReservas} allowedRoles={["employee", "admin"]} />} />
      <Route path={"/employee/manutencoes"} component={() => <ProtectedRoute component={EmployeeManutencoes} allowedRoles={["employee", "admin"]} />} />
      <Route path={"/employee/abastecimentos"} component={() => <ProtectedRoute component={EmployeeAbastecimentos} allowedRoles={["employee", "admin"]} />} />
      <Route path={"/employee/vistorias"} component={() => <ProtectedRoute component={EmployeeVistorias} allowedRoles={["employee", "admin"]} />} />
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

function ConditionalWhatsApp() {
  const [location] = useLocation();
  if (location.startsWith('/admin')) return null;
  return <WhatsAppButton />;
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
        // switchable
      >
        <TooltipProvider>
          <ConfirmProvider>
            <Toaster />
            <Router />
            <ConditionalWhatsApp />
          </ConfirmProvider>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
