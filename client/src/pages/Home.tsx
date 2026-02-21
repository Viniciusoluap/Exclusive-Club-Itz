import { useAuth } from "@/_core/hooks/useAuth";
import { MobileMenu } from "@/components/MobileMenu";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { APP_LOGO, getLoginUrl } from "@/const";
import { Anchor, Calendar, Ship, Waves } from "lucide-react";
import { Link } from "wouter";

export default function Home() {
  const { user, isAuthenticated, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2 md:gap-3">
              <img src={APP_LOGO} alt="Exclusive Club" className="h-10 w-10 md:h-12 md:w-12" style={{width: '50px', height: '47px'}} />
              <span className="text-base md:text-xl font-bold text-primary">Exclusive Club</span>
            </div>
            <nav className="hidden md:flex items-center gap-6">
              <a href="#home" className="text-foreground hover:text-primary transition-colors">
                Home
              </a>
              <a href="#embarcacoes" className="text-foreground hover:text-primary transition-colors">
                Embarcações
              </a>
              <Link href="/galeria">
                <span className="text-foreground hover:text-primary transition-colors cursor-pointer">
                  Galeria
                </span>
              </Link>
              {isAuthenticated && user?.role !== "employee" && (
                <Link href="/dashboard">
                  <span className="text-foreground hover:text-primary transition-colors cursor-pointer">
                    Dashboard
                  </span>
                </Link>
              )}
              <a href="#sobre" className="text-foreground hover:text-primary transition-colors">
                Sobre Nós
              </a>
              {isAuthenticated ? (
                <>
                  {user?.role === "admin" && (
                    <Link href="/admin">
                      <Button variant="outline">Admin</Button>
                    </Link>
                  )}
                  {user?.role === "employee" && (
                    <Link href="/employee/reservas">
                      <Button variant="outline">Painel Funcionário</Button>
                    </Link>
                  )}
                  {user?.role === "user" && (
                    <Link href="/reservas">
                      <Button>Minhas Reservas</Button>
                    </Link>
                  )}
                  <Button variant="ghost" onClick={handleLogout}>Sair</Button>
                </>
              ) : (
                <Button asChild>
                  <a href={getLoginUrl()}>Agendar Reserva</a>
                </Button>
              )}
            </nav>
            <div className="md:hidden">
              <MobileMenu />
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section
        id="home"
        className="relative min-h-screen flex items-center justify-center pt-16"
        style={{
          backgroundImage: 'url(/images/yacht-hero.webp)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-primary/90 to-secondary/80"></div>
        <div className="relative z-10 container text-center text-white px-4">
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold mb-6 animate-fade-in">
            VIVA MOMENTOS INESQUECÍVEIS COM RESERVA DE EMBARCAÇÕES
          </h1>
          <p className="text-lg md:text-xl lg:text-2xl mb-4 max-w-3xl mx-auto">
            Sistema completo de <span className="font-semibold">gestão náutica</span> com reservas de lanchas,
            jetskis, controle de abastecimento de combustível, vistorias e pagamentos online via PIX.
            Clube náutico com compartilhamento inteligente de embarcações.
          </p>
          <p className="text-lg md:text-xl mb-8">
            Venha ser feliz com a <span className="font-bold">Exclusive Club</span>, sua marina digital.
            Gestão de barcos profissional e acessível.
          </p>
          {isAuthenticated ? (
            <Link href="/reservas">
              <Button size="lg" variant="secondary" className="text-lg px-8 py-6">
                <Calendar className="mr-2 h-5 w-5" />
                Fazer Reserva
              </Button>
            </Link>
          ) : (
            <Button size="lg" variant="secondary" className="text-lg px-8 py-6" asChild>
              <a href={getLoginUrl()}>
                <Calendar className="mr-2 h-5 w-5" />
                Agendar Agora
              </a>
            </Button>
          )}
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-muted/30">
        <div className="container">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-12 text-primary">
            Sistema Completo de Gestão Náutica
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <Card className="text-center border-primary/20 hover:border-primary transition-colors">
              <CardHeader>
                <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <Ship className="h-8 w-8 text-primary" />
                </div>
                <CardTitle>Embarcações de Luxo</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base">
                  Lanchas e jetskis de alta qualidade para reserva. Sistema de compartilhamento de embarcações
                  com gestão profissional de marina e clube náutico.
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="text-center border-secondary/20 hover:border-secondary transition-colors">
              <CardHeader>
                <div className="mx-auto w-16 h-16 rounded-full bg-secondary/10 flex items-center justify-center mb-4">
                  <Calendar className="h-8 w-8 text-secondary" />
                </div>
                <CardTitle>Reserva Fácil</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base">
                  Sistema de reservas online simples e rápido. Agende suas datas com controle de disponibilidade
                  e gestão inteligente de horários para embarcações.
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="text-center border-accent/20 hover:border-accent transition-colors">
              <CardHeader>
                <div className="mx-auto w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center mb-4">
                  <Waves className="h-8 w-8 text-accent" />
                </div>
                <CardTitle>Uso Ilimitado</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base">
                  Acesso exclusivo ao clube náutico com gestão de abastecimento, vistorias de embarcações
                  e pagamentos online via PIX. Marina digital completa.
                </CardDescription>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Vessels Section */}
      <section id="embarcacoes" className="py-20">
        <div className="container">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-4 text-primary">
            CONHEÇA NOSSAS EMBARCAÇÕES PARA RESERVA
          </h2>
          <p className="text-center text-muted-foreground mb-12 text-lg">
            Sistema de reserva de lanchas e jetskis. Agende o dia e horário para sua embarcação
            com gestão profissional de marina e clube náutico.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            <Card className="overflow-hidden hover:shadow-xl transition-shadow">
              <div className="aspect-video relative">
                <img
                  src="/images/jetski-seadoo.jpg"
                  alt="Jetski Seadoo"
                  className="w-full h-full object-cover"
                />
              </div>
              <CardHeader>
                <CardTitle className="text-2xl">JETSKI SEADOO GTI SE 130HP - Reserva Online</CardTitle>
                <CardDescription className="text-base">
                  Jetski Seadoo GTI SE 130HP disponível para reserva. Sistema de compartilhamento de embarcações
                  com gestão náutica profissional. Perfeito para aventuras aquáticas em família.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="overflow-hidden hover:shadow-xl transition-shadow">
              <div className="aspect-video relative">
                <img
                  src="/images/focker-215.jpg"
                  alt="Lancha Focker"
                  className="w-full h-full object-cover"
                />
              </div>
              <CardHeader>
                <CardTitle className="text-2xl">Lancha Focker 215 150HP - Sistema de Reservas</CardTitle>
                <CardDescription className="text-base">
                  Lancha Focker 215 150HP disponível para reserva online. Capacidade para 7 pessoas.
                  Gestão de embarcações com controle de abastecimento e vistorias. Marina digital completa.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>
      </section>

      {/* About Section */}
      <section id="sobre" className="py-20 bg-primary/5">
        <div className="container max-w-4xl">
          <div className="text-center mb-12">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/10 mb-6">
              <Anchor className="h-10 w-10 text-primary" />
            </div>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">QUEM SOMOS NÓS</h2>
            <h3 className="text-2xl font-semibold text-primary mb-6">EXCLUSIVE CLUB</h3>
          </div>

          <div className="space-y-6 text-lg text-foreground/90">
            <p>
              <strong>Exclusive Club</strong> é uma empresa especializada em <strong>gestão náutica</strong> que promove
              e gerencia a compra compartilhada de embarcações para lazer. Sistema completo de <strong>reservas de lanchas</strong>,
              <strong>jetskis</strong>, controle de <strong>abastecimento de combustível</strong>, <strong>vistorias de embarcações</strong>
              e <strong>pagamentos online via PIX</strong>.
            </p>
            <p>
              Empresa líder no segmento de <strong>administração de cotas náuticas</strong> e <strong>clube náutico</strong>.
              Criamos e administramos grupos com 4 até 10 cotistas por embarcação. <strong>Marina digital</strong> com
              sistema de reservas online, gestão de barcos e controle completo de operações náuticas.
            </p>
            <div className="bg-secondary/10 p-6 rounded-lg border border-secondary/20">
              <p className="font-semibold text-secondary mb-2">Compartilhando Sonhos - Marina Digital</p>
              <p className="text-base">
                Somos a primeira empresa de <strong>compartilhamento de embarcações</strong> da região TOCANTINA,
                com <strong>sistema de gestão náutica</strong> completo. Oferecemos <strong>reserva de lanchas e jetskis</strong>,
                abastecimento, vistorias e pagamentos online. <strong>Clube náutico</strong> acessível a todos.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      {!isAuthenticated && (
        <section className="py-20 bg-gradient-to-r from-primary to-secondary text-white">
          <div className="container text-center">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">Pronto para começar?</h2>
            <p className="text-xl mb-8 max-w-2xl mx-auto">
              Faça login no sistema de gestão náutica para agendar reservas de embarcações,
              gerenciar abastecimentos e pagamentos online via PIX
            </p>
            <Button size="lg" variant="secondary" className="text-lg px-8 py-6" asChild>
              <a href={getLoginUrl()}>
                <Calendar className="mr-2 h-5 w-5" />
                Fazer Login
              </a>
            </Button>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="bg-foreground/5 py-12 border-t">
        <div className="container">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <img src={APP_LOGO} alt="Exclusive Club" className="h-12 w-12" style={{width: '70px', height: '65px'}} />
                <span className="text-xl font-bold text-primary">Exclusive Club</span>
              </div>
              <p className="text-muted-foreground">Compartilhando Sonhos</p>
            </div>

            <div>
              <h3 className="font-semibold mb-4">Contato</h3>
              <p className="text-muted-foreground text-sm">
                Rua Leôncio Pires Dourado 840-A, Bacuri
                <br />
                Imperatriz - MA
              </p>
            </div>

            <div>
              <h3 className="font-semibold mb-4">Horário de Funcionamento</h3>
              <p className="text-muted-foreground text-sm">
                Terça a Domingo: 10:00 - 19:00
                <br />
                Segunda-feira: Fechado
              </p>
            </div>
          </div>

          <div className="mt-8 pt-8 border-t text-center text-muted-foreground text-sm">
            <p>© 2025 Exclusive Club. Todos os direitos reservados.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
