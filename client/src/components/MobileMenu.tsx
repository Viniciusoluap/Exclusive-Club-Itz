import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu, X } from "lucide-react";
import { Link } from "wouter";
import { APP_LOGO, getLoginUrl } from "@/const";

interface MobileMenuProps {
  isAuthenticated: boolean;
  userRole?: string;
  onLogout: () => void;
}

export function MobileMenu({ isAuthenticated, userRole, onLogout }: MobileMenuProps) {
  const [open, setOpen] = useState(false);

  const closeMenu = () => setOpen(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden">
          <Menu className="h-6 w-6" />
          <span className="sr-only">Abrir menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[300px] sm:w-[400px]">
        <div className="flex flex-col h-full">
          {/* Header do Menu */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <img src={APP_LOGO} alt="Exclusive Club" className="h-10 w-10" />
              <span className="text-lg font-bold text-primary">Exclusive Club</span>
            </div>
          </div>

          {/* Links de Navegação */}
          <nav className="flex flex-col gap-4 flex-1">
            <a
              href="#home"
              className="text-lg text-foreground hover:text-primary transition-colors py-2"
              onClick={closeMenu}
            >
              Home
            </a>
            <Link href="/embarcacoes">
              <span
                className="text-lg text-foreground hover:text-primary transition-colors cursor-pointer py-2 block"
                onClick={closeMenu}
              >
                Embarcações
              </span>
            </Link>
            <Link href="/galeria">
              <span
                className="text-lg text-foreground hover:text-primary transition-colors cursor-pointer py-2 block"
                onClick={closeMenu}
              >
                Galeria
              </span>
            </Link>
            {isAuthenticated && (
              <Link href="/dashboard">
                <span
                  className="text-lg text-foreground hover:text-primary transition-colors cursor-pointer py-2 block"
                  onClick={closeMenu}
                >
                  Dashboard
                </span>
              </Link>
            )}
            <a
              href="#sobre"
              className="text-lg text-foreground hover:text-primary transition-colors py-2"
              onClick={closeMenu}
            >
              Sobre Nós
            </a>

            {/* Separador */}
            <div className="border-t my-4"></div>

            {/* Botões de Ação */}
            {isAuthenticated ? (
              <div className="space-y-3">
                {userRole === "admin" && (
                  <Link href="/admin">
                    <Button variant="outline" className="w-full" onClick={closeMenu}>
                      Administrador
                    </Button>
                  </Link>
                )}
                <Link href="/reservas">
                  <Button className="w-full" onClick={closeMenu}>
                    Minhas Reservas
                  </Button>
                </Link>
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => {
                    onLogout();
                    closeMenu();
                  }}
                >
                  Sair
                </Button>
              </div>
            ) : (
              <Button className="w-full" asChild>
                <a href={getLoginUrl()} onClick={closeMenu}>
                  Fazer Login
                </a>
              </Button>
            )}
          </nav>
        </div>
      </SheetContent>
    </Sheet>
  );
}
