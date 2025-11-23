import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { APP_LOGO, getLoginUrl } from "@/const";
import { Anchor, Calendar, Ship, Waves } from "lucide-react";
import { Link } from "wouter";
import { MobileMenu } from "@/components/MobileMenu";

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
            <div className="flex items-center gap-3">
              <img src={APP_LOGO} alt="Exclusive Club" className="h-12 w-12" />
              <span className="text-xl font-bold text-primary">Exclusive Club</span>
            </div>
            <nav className="hidden md:flex items-center gap-6">
              <a href="#home" className="text-foreground hover:text-primary transition-colors">
                Home
              </a>
              <Link href="/embarcacoes">
                <span className="text-foreground hover:text-primary transition-colors cursor-pointer">
                  Embarcações
                </span>
              </Link>
              <Link href="/galeria">
                <span className="text-foreground hover:text-primary transition-colors cursor-pointer">
                  Galeria
                </span>
              </Link>
              {isAuthenticated && (
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
                  <Link href="/reservas">
                    <Button>Minhas Reservas</Button>
                  </Link>
                  <Button variant="ghost" onClick={handleLogout}>Sair</Button>
                </>
              ) : (
                <Button asChild>
                  <a href={getLoginUrl()}>Agendar Reserva</a>
                </Button>
              )}
            </nav>
            <div className="md:hidden">
              <MobileMenu
                isAuthenticated={isAuthenticated}
                userRole={user?.role}
                onLogout={handleLogout}
              />
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
            VIVA MOMENTOS
            <br />
            INESQUECÍVEIS.
          </h1>
          <p className="text-lg md:text-xl lg:text-2xl mb-4 max-w-3xl mx-auto">
            Proporcionamos lazer e agilidade para milhares de pessoas no país através do{" "}
            <span className="font-semibold">sistema inteligente de compartilhamento</span> de lanchas,
            jetskis e aeronaves.
          </p>
          <p className="text-lg md:text-xl mb-8">
            Venha ser feliz com a <span className="font-bold">Exclusive Club</span>, seu sonho custa menos
            do que imagina.
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
                  Lanchas e jetskis de alta qualidade, sempre prontos para sua diversão
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
                  Sistema online simples e rápido para agendar suas datas
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
                  Aproveite o ano todo com acesso exclusivo às nossas embarcações
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
            CONHEÇA NOSSAS EMBARCAÇÕES
          </h2>
          <p className="text-center text-muted-foreground mb-12 text-lg">
            Aqui você reserva o dia e horário para andar em sua embarcação
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
                <CardTitle className="text-2xl">JETSKI SEADOO GTI SE 130HP</CardTitle>
                <CardDescription className="text-base">
                  O GTI SE é onde a diversão em família fica maior e melhor. Perfeito para aventuras
                  aquáticas emocionantes.
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
                <CardTitle className="text-2xl">Focker 215 150HP</CardTitle>
                <CardDescription className="text-base">
                  A Focker 215 pode receber até 7 pessoas. O seu solarium tem capacidade para toda a
                  família aproveitar momentos inesquecíveis.
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
              Empresa que promove e gerencia a compra compartilhada de embarcações para lazer náutico.
            </p>
            <p>
              Empresa líder no segmento para administração de cotas náuticas. Criamos e administramos
              grupos com 4 até 10 cotistas por embarcação e cuidamos de toda a parte trabalhosa para você
              se preocupar apenas com o lazer.
            </p>
            <div className="bg-secondary/10 p-6 rounded-lg border border-secondary/20">
              <p className="font-semibold text-secondary mb-2">Compartilhando Sonhos</p>
              <p className="text-base">
                Somos a primeira empresa de compartilhamento de embarcações da região TOCANTINA,
                disponibilizando os melhores preços e embarcações do mercado, deixando acessível a todos
                que tenham esse sonho.
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
              Faça login para agendar suas reservas e aproveitar momentos inesquecíveis
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
                <img src={APP_LOGO} alt="Exclusive Club" className="h-12 w-12" />
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
