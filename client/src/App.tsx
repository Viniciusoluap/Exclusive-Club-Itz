import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ConfirmProvider } from "@/hooks/useConfirm";
import { Redirect, Route, Switch } from "wouter";
import { lazy, Suspense } from "react";
import { useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import ProtectedRoute from "./components/ProtectedRoute";
import { PageLoader } from "./components/PageLoader";
import WhatsAppButton from "./components/WhatsAppButton";
import { ThemeProvider } from "./contexts/ThemeContext";

// Story 25 (Fase 3, UX-10): rotas carregadas sob demanda (code-splitting)
// em vez de tudo num único bundle inicial — a maioria dos visitantes nunca
// abre as telas de admin/employee, que eram enviadas ao navegador mesmo
// assim. Suspense com PageLoader cobre o intervalo de carregamento do
// chunk da rota.
const Home = lazy(() => import("./pages/Home"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Galeria = lazy(() => import("./pages/Galeria"));
const Reservas = lazy(() => import("./pages/Reservas"));
const AccessDenied = lazy(() => import("./pages/AccessDenied"));
const Admin = lazy(() => import("./pages/Admin"));
const AdminManutencao = lazy(() => import("./pages/AdminManutencao"));
const Funcionarios = lazy(() => import("./pages/Funcionarios"));
const Abastecimento = lazy(() => import("./pages/Abastecimento"));
const Vistorias = lazy(() => import("./pages/Vistorias"));
const CobrancasDanos = lazy(() => import("./pages/admin/CobrancasDanos"));
const SolicitacoesVencimento = lazy(() => import("./pages/admin/SolicitacoesVencimento"));
const EmployeeReservas = lazy(() => import("./pages/employee/Reservas"));
const EmployeeManutencoes = lazy(() => import("./pages/employee/Manutencoes"));
const EmployeeAbastecimentos = lazy(() => import("./pages/employee/Abastecimentos"));
const EmployeeVistorias = lazy(() => import("./pages/employee/Vistorias"));
const MeusAbastecimentos = lazy(() => import("./pages/MeusAbastecimentos"));
const SystemSettings = lazy(() => import("./pages/SystemSettings"));
const Diagnostico = lazy(() => import("./pages/Diagnostico"));
const RoleRedirect = lazy(() => import("./components/RoleRedirect"));
const PagamentoDanos = lazy(() => import("./pages/PagamentoDanos"));
const Mensalidades = lazy(() => import("./pages/Mensalidades"));
const AdminBackups = lazy(() => import("./pages/admin/Backups"));
const AdminSaas = lazy(() => import("./pages/admin/Saas"));
const OpenFinance = lazy(() => import("./pages/admin/OpenFinance"));
const NotFound = lazy(() => import("@/pages/NotFound"));

function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Suspense fallback={<PageLoader />}>
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
        <Route path={"/admin/diagnostico"} component={() => <ProtectedRoute component={Diagnostico} allowedRoles={["admin"]} />} />
        <Route path={"/admin/pagamentos"} component={() => <Redirect to="/admin/saas" />} />
        <Route path={"/admin/backups"} component={() => <ProtectedRoute component={AdminBackups} allowedRoles={["admin"]} />} />
        <Route path={"/admin/saas"} component={() => <ProtectedRoute component={AdminSaas} allowedRoles={["admin"]} />} />
        <Route path={"/admin/open-finance"} component={() => <ProtectedRoute component={OpenFinance} allowedRoles={["admin"]} />} />
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
    </Suspense>
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
