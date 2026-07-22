import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface PageLoaderProps {
  className?: string;
  message?: string;
}

/**
 * Story 25 (Fase 3, UX-10/UX-03): loading unificado de página inteira.
 * Substitui as ~19 variações de spinner de página repetidas pela app —
 * `<div className="animate-spin rounded-full ...">` com tamanhos/cores
 * divergentes e o padrão `Loader2` com props ligeiramente diferentes em
 * cada arquivo — por um único componente consistente. `className` permite
 * ajustar o fundo (ex.: telas com identidade visual própria); `message`
 * mostra um texto opcional abaixo do spinner.
 */
export function PageLoader({ className, message }: PageLoaderProps) {
  return (
    <div className={cn("flex items-center justify-center min-h-screen", className)}>
      <div className="text-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
        {message && <p className="mt-4 text-muted-foreground">{message}</p>}
      </div>
    </div>
  );
}
