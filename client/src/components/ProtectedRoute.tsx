import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { PageLoader } from "@/components/PageLoader";
import { useEffect, type ComponentType } from "react";
import { useLocation } from "wouter";

type Role = "user" | "employee" | "admin";

interface ProtectedRouteProps {
  component: ComponentType;
  allowedRoles: Role[];
}

/**
 * Story 23 (Fase 2, UX-17): guarda de rota por papel, montada no nível da
 * rota (App.tsx) em vez de dentro do layout da página. Isso garante que o
 * componente protegido — e os hooks/queries que ele dispara no corpo da
 * função — só é montado depois de confirmado o papel do usuário; antes
 * disso (ex.: EmployeeDashboardLayout checando o role só no próprio JSX
 * de retorno), as queries da página já tinham disparado antes da negação
 * de acesso ser renderizada. Espelha a matriz de authz do backend
 * (Story 12: adminProcedure/employeeProcedure) por papel de rota.
 */
export default function ProtectedRoute({ component: Component, allowedRoles }: ProtectedRouteProps) {
  const { user, isAuthenticated, loading } = useAuth();
  const [, setLocation] = useLocation();

  const isAuthorized = isAuthenticated && !!user && allowedRoles.includes(user.role as Role);

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated) {
      window.location.href = getLoginUrl();
      return;
    }
    if (!isAuthorized) {
      setLocation("/acesso-negado");
    }
  }, [loading, isAuthenticated, isAuthorized, setLocation]);

  if (loading || !isAuthorized) {
    return <PageLoader />;
  }

  return <Component />;
}
