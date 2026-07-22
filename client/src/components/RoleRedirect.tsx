import { useAuth } from "@/_core/hooks/useAuth";
import { PageLoader } from "@/components/PageLoader";
import { useEffect } from "react";
import { useLocation } from "wouter";

/**
 * Componente que redireciona usuários para o dashboard correto baseado em seu role
 * - admin → /admin
 * - employee → /employee/reservas
 * - user → /dashboard
 */
export default function RoleRedirect() {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (loading || !user) return;

    // Redirecionar baseado no role
    if (user.role === "admin") {
      setLocation("/admin");
    } else if (user.role === "employee") {
      setLocation("/employee/reservas");
    } else {
      setLocation("/dashboard");
    }
  }, [user, loading, setLocation]);

  if (loading) {
    return <PageLoader />;
  }

  return null;
}
