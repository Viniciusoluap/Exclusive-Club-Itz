import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { APP_LOGO, getLoginUrl } from "@/const";
import { Menu, X, Pencil, Check } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export function MobileMenu() {
  const [open, setOpen] = useState(false);
  const { user, isAuthenticated, logout } = useAuth();
  const [location] = useLocation();
  const [isEditingName, setIsEditingName] = useState(false);
  const [newName, setNewName] = useState("");
  const utils = trpc.useUtils();
  
  // @ts-ignore
  const updateName = trpc.auth.updateName.useMutation({
    onSuccess: () => {
      toast.success("Nome atualizado com sucesso!");
      setIsEditingName(false);
      utils.auth.me.invalidate();
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao atualizar nome");
    },
  });

  const handleLogout = async () => {
    await logout();
    setOpen(false);
  };

  const handleLinkClick = () => {
    setOpen(false);
  };

  const NavLink = ({ href, children, isExternal = false }: { href: string; children: React.ReactNode; isExternal?: boolean }) => {
    const isActive = location === href;
    
    if (isExternal) {
      return (
        <a
          href={href}
          className={`block px-4 py-3 text-lg rounded-lg transition-colors ${
            isActive
              ? "bg-primary text-primary-foreground"
              : "text-foreground hover:bg-accent"
          }`}
          onClick={handleLinkClick}
        >
          {children}
        </a>
      );
    }

    return (
      <Link href={href}>
        <a
          className={`block px-4 py-3 text-lg rounded-lg transition-colors ${
            isActive
              ? "bg-primary text-primary-foreground"
              : "text-foreground hover:bg-accent"
          }`}
          onClick={handleLinkClick}
        >
          {children}
        </a>
      </Link>
    );
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden">
          <Menu className="h-6 w-6" />
          <span className="sr-only">Abrir menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[300px] sm:w-[400px]">
        <SheetHeader className="mb-6">
          <div className="flex items-center gap-3">
            <img src={APP_LOGO} alt="Exclusive Club" className="h-10 w-10" style={{width: '70px', height: '65px'}} />
            <SheetTitle className="text-primary">Exclusive Club</SheetTitle>
          </div>
        </SheetHeader>

        <nav className="flex flex-col gap-2">
          <NavLink href="/" isExternal>
            Home
          </NavLink>
          
          <a
            href="/#embarcacoes"
            className="block px-4 py-3 text-lg rounded-lg transition-colors text-foreground hover:bg-accent"
            onClick={handleLinkClick}
          >
            Embarcações
          </a>

          <NavLink href="/galeria">
            Galeria
          </NavLink>

          {isAuthenticated && user?.role !== "employee" && (
            <>
              <NavLink href="/dashboard">
                Dashboard
              </NavLink>
              <NavLink href="/reservas">
                Minhas Reservas
              </NavLink>
            </>
          )}

          <a
            href="/#sobre"
            className="block px-4 py-3 text-lg rounded-lg transition-colors text-foreground hover:bg-accent"
            onClick={handleLinkClick}
          >
            Sobre Nós
          </a>

          {isAuthenticated && user?.role === "admin" && (
            <NavLink href="/admin">
              Admin
            </NavLink>
          )}
          
          {isAuthenticated && user?.role === "employee" && (
            <NavLink href="/employee/reservas">
              Painel Funcionário
            </NavLink>
          )}

          <div className="border-t border-border my-4"></div>

          {isAuthenticated ? (
            <div className="space-y-2">
              {isEditingName ? (
                <div className="px-4 py-2 space-y-2">
                  <Label htmlFor="edit-name">Novo Nome</Label>
                  <div className="flex gap-2">
                    <Input
                      id="edit-name"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="Digite seu nome"
                      className="flex-1"
                    />
                    <Button
                      size="icon"
                      onClick={() => {
                        if (newName.trim()) {
                          updateName.mutate({ name: newName.trim() });
                        }
                      }}
                      disabled={!newName.trim() || updateName.isPending}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() => {
                        setIsEditingName(false);
                        setNewName("");
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="px-4 py-2 flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Olá, {user?.name?.split(" ")[0] || "Usuário"}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      setIsEditingName(true);
                      setNewName(user?.name || "");
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              )}
              <Button
                variant="outline"
                className="w-full justify-start text-lg h-12"
                onClick={handleLogout}
              >
                Sair
              </Button>
            </div>
          ) : (
            <Button asChild className="w-full text-lg h-12">
              <a href={getLoginUrl()} onClick={handleLinkClick}>
                Entrar / Agendar
              </a>
            </Button>
          )}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
