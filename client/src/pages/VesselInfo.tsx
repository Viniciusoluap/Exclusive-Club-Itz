import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { APP_LOGO } from "@/const";
import { MobileMenu } from "@/components/MobileMenu";
import {
  Anchor,
  AlertTriangle,
  CheckCircle2,
  Gauge,
  Users,
  Fuel,
  Waves,
  Shield,
  FileText,
  Download,
} from "lucide-react";
import { Link } from "wouter";

export default function VesselInfo() {
  const { user, isAuthenticated, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-cyan-50 to-white">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link href="/">
            <a className="flex items-center gap-2">
              <img src={APP_LOGO} alt="Exclusive Club" className="h-10 w-10 rounded-full object-cover" />
              <span className="text-xl font-bold text-cyan-700">Exclusive Club</span>
            </a>
          </Link>
          <nav className="hidden md:flex gap-6">
            <Link href="/">
              <a className="text-gray-700 hover:text-cyan-600 transition-colors">Home</a>
            </Link>
            <Link href="/embarcacoes">
              <a className="text-cyan-600 font-semibold">Embarcações</a>
            </Link>
            <Link href="/galeria">
              <a className="text-gray-700 hover:text-cyan-600 transition-colors">Galeria</a>
            </Link>
            {isAuthenticated && (
              <>
                <Link href="/dashboard">
                  <a className="text-gray-700 hover:text-cyan-600 transition-colors">Dashboard</a>
                </Link>
                <Link href="/reservas">
                  <a className="text-gray-700 hover:text-cyan-600 transition-colors">Reservas</a>
                </Link>
              </>
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
      </header>

      {/* Hero Section */}
      <section className="bg-gradient-to-r from-cyan-600 to-blue-600 py-16 text-white">
        <div className="container mx-auto text-center px-4">
          <Anchor className="h-16 w-16 mx-auto mb-4" />
          <h1 className="text-4xl font-bold mb-4">Informações das Embarcações</h1>
          <p className="text-xl text-cyan-100">
            Especificações técnicas completas e manual de segurança
          </p>
        </div>
      </section>

      {/* Main Content */}
      <main className="container mx-auto py-12 px-4">
        <Tabs defaultValue="focker" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-8">
            <TabsTrigger value="focker">Lancha Focker 215</TabsTrigger>
            <TabsTrigger value="seadoo">Jetski Sea-Doo</TabsTrigger>
            <TabsTrigger value="safety">Manual de Segurança</TabsTrigger>
          </TabsList>

          {/* Focker 215 Tab */}
          <TabsContent value="focker">
            <div className="grid gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Waves className="h-6 w-6 text-cyan-600" />
                    Lancha Focker 215 - 150HP
                  </CardTitle>
                  <CardDescription>
                    Lancha espaçosa e confortável, ideal para passeios em família
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="aspect-video mb-6 rounded-lg overflow-hidden">
                    <img
                      src="/images/vessels/IMG_9049.jpg"
                      alt="Lancha Focker 215"
                      className="w-full h-full object-cover"
                    />
                  </div>

                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                        <Gauge className="h-5 w-5 text-cyan-600" />
                        Dimensões
                      </h3>
                      <ul className="space-y-2 text-sm">
                        <li><strong>Comprimento:</strong> 6,17 m (6,37 m com opcionais)</li>
                        <li><strong>Largura:</strong> 2,32 m</li>
                        <li><strong>Calado:</strong> 0,32 m a 0,48 m</li>
                        <li><strong>Peso:</strong> Aprox. 800 kg (sem motor)</li>
                      </ul>
                    </div>

                    <div>
                      <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                        <Fuel className="h-5 w-5 text-cyan-600" />
                        Motorização
                      </h3>
                      <ul className="space-y-2 text-sm">
                        <li><strong>Motor:</strong> Mercury 150HP (4 tempos)</li>
                        <li><strong>Potência:</strong> 150 HP / 112 kW</li>
                        <li><strong>Combustível:</strong> Gasolina</li>
                        <li><strong>Tanque:</strong> 100-140 litros</li>
                        <li><strong>Consumo:</strong> ~10 L/h a 2.500 rpm</li>
                      </ul>
                    </div>

                    <div>
                      <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                        <Users className="h-5 w-5 text-cyan-600" />
                        Capacidades
                      </h3>
                      <ul className="space-y-2 text-sm">
                        <li><strong>Passageiros:</strong> Até 7 + 1 piloto</li>
                        <li><strong>Tanque de água:</strong> 28 litros</li>
                        <li><strong>Solarium:</strong> 2 passageiros</li>
                        <li><strong>Cabine:</strong> Com beliches</li>
                        <li><strong>Banheiro:</strong> Químico</li>
                      </ul>
                    </div>

                    <div>
                      <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5 text-cyan-600" />
                        Características
                      </h3>
                      <ul className="space-y-2 text-sm">
                        <li><strong>Casco:</strong> Fibra de vidro (GRP)</li>
                        <li><strong>Ângulo V:</strong> 19°</li>
                        <li><strong>Classificação:</strong> CE Classe C</li>
                        <li><strong>Velocidade cruzeiro:</strong> 9 nós</li>
                        <li><strong>Direção:</strong> Firme e responsiva</li>
                      </ul>
                    </div>
                  </div>

                  <div className="mt-6 p-4 bg-cyan-50 rounded-lg border border-cyan-200">
                    <h4 className="font-semibold mb-2 text-cyan-900">Equipamentos de Conforto</h4>
                    <p className="text-sm text-cyan-800">
                      Cabine com beliches, banheiro químico, solarium na proa, bancos conversíveis,
                      capota de sol, direção hidráulica, e resposta rápida aos comandos.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Sea-Doo Tab */}
          <TabsContent value="seadoo">
            <div className="grid gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Waves className="h-6 w-6 text-cyan-600" />
                    Jetski Sea-Doo GTI SE 130 - 130HP
                  </CardTitle>
                  <CardDescription>
                    Jetski potente e ágil, perfeito para aventuras aquáticas
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="aspect-video mb-6 rounded-lg overflow-hidden">
                    <img
                      src="/images/vessels/IMG_0485.jpg"
                      alt="Jetski Sea-Doo"
                      className="w-full h-full object-cover"
                    />
                  </div>

                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                        <Gauge className="h-5 w-5 text-cyan-600" />
                        Dimensões
                      </h3>
                      <ul className="space-y-2 text-sm">
                        <li><strong>Comprimento:</strong> 3,23 m</li>
                        <li><strong>Largura:</strong> 1,25 m</li>
                        <li><strong>Altura:</strong> 1,17 m</li>
                        <li><strong>Peso seco:</strong> 333-359 kg</li>
                      </ul>
                    </div>

                    <div>
                      <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                        <Fuel className="h-5 w-5 text-cyan-600" />
                        Motorização
                      </h3>
                      <ul className="space-y-2 text-sm">
                        <li><strong>Motor:</strong> Rotax 1630cc 4-TEC</li>
                        <li><strong>Potência:</strong> 130 HP / 107 kW</li>
                        <li><strong>Cilindrada:</strong> 1.630 cc</li>
                        <li><strong>Configuração:</strong> 4T, 3 cilindros</li>
                        <li><strong>Arrefecimento:</strong> Circuito fechado</li>
                      </ul>
                    </div>

                    <div>
                      <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                        <Users className="h-5 w-5 text-cyan-600" />
                        Capacidades
                      </h3>
                      <ul className="space-y-2 text-sm">
                        <li><strong>Passageiros:</strong> Até 3 pessoas</li>
                        <li><strong>Capacidade de peso:</strong> 272 kg</li>
                        <li><strong>Tanque combustível:</strong> 60-70 litros</li>
                        <li><strong>Porta-luvas:</strong> 8,8 litros</li>
                        <li><strong>Compartimento frontal:</strong> 144 litros</li>
                      </ul>
                    </div>

                    <div>
                      <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5 text-cyan-600" />
                        Tecnologia
                      </h3>
                      <ul className="space-y-2 text-sm">
                        <li><strong>Sistema iBR®:</strong> Freio, neutro e ré</li>
                        <li><strong>Sistema iTC™:</strong> Controle inteligente</li>
                        <li><strong>Áudio:</strong> Bluetooth à prova d'água</li>
                        <li><strong>Painel:</strong> Digital multifuncional</li>
                        <li><strong>Segurança:</strong> Cordão de desligamento</li>
                      </ul>
                    </div>
                  </div>

                  <div className="mt-6 p-4 bg-cyan-50 rounded-lg border border-cyan-200">
                    <h4 className="font-semibold mb-2 text-cyan-900">Performance e Segurança</h4>
                    <p className="text-sm text-cyan-800">
                      Aceleração rápida e ágil, sistema de estabilização aprimorado, excelente controle
                      e direção responsiva. Assentos ergonômicos, alças de apoio, tapete antiderrapante
                      e sistema de drenagem automática.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Safety Manual Tab */}
          <TabsContent value="safety">
            <div className="grid gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-6 w-6 text-red-600" />
                    Manual de Segurança Náutica
                  </CardTitle>
                  <CardDescription>
                    Leia atentamente antes de utilizar qualquer embarcação
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Checklist Pré-Navegação */}
                  <div>
                    <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                      <FileText className="h-5 w-5 text-cyan-600" />
                      Checklist Pré-Navegação
                    </h3>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                        <h4 className="font-semibold mb-2 text-blue-900">Documentação</h4>
                        <ul className="space-y-1 text-sm text-blue-800">
                          <li>✓ Habilitação náutica válida</li>
                          <li>✓ Documentos pessoais</li>
                          <li>✓ Registro da embarcação</li>
                          <li>✓ Seguro náutico em dia</li>
                        </ul>
                      </div>
                      <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                        <h4 className="font-semibold mb-2 text-green-900">Equipamentos Obrigatórios</h4>
                        <ul className="space-y-1 text-sm text-green-800">
                          <li>✓ Coletes salva-vidas (1 por pessoa)</li>
                          <li>✓ Extintor de incêndio válido</li>
                          <li>✓ Buzina ou apito</li>
                          <li>✓ Kit de primeiros socorros</li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  {/* Regras Fundamentais */}
                  <div>
                    <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-red-600" />
                      Regras de Segurança Fundamentais
                    </h3>
                    <div className="space-y-3">
                      <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                        <h4 className="font-semibold text-red-900 mb-2">🛟 Uso de Colete Salva-Vidas</h4>
                        <p className="text-sm text-red-800">
                          <strong>OBRIGATÓRIO</strong> para todos os ocupantes durante toda a navegação.
                          Multa e responsabilização em caso de descumprimento.
                        </p>
                      </div>
                      <div className="p-4 bg-orange-50 rounded-lg border border-orange-200">
                        <h4 className="font-semibold text-orange-900 mb-2">🚫 Consumo de Álcool</h4>
                        <p className="text-sm text-orange-800">
                          <strong>PROIBIDO</strong> consumir bebidas alcoólicas antes ou durante a pilotagem.
                          Sujeito a multas e suspensão da habilitação náutica.
                        </p>
                      </div>
                      <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                        <h4 className="font-semibold text-yellow-900 mb-2">⚖️ Capacidade Máxima</h4>
                        <p className="text-sm text-yellow-800">
                          Lancha: Máximo 7 + 1 piloto | Jetski: Máximo 3 pessoas.
                          <strong> NUNCA exceda a capacidade</strong> - risco de naufrágio.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Contatos de Emergência */}
                  <div>
                    <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                      <Shield className="h-5 w-5 text-red-600" />
                      Contatos de Emergência
                    </h3>
                    <div className="grid md:grid-cols-3 gap-4">
                      <div className="p-3 bg-gray-50 rounded-lg border text-center">
                        <p className="font-semibold text-sm">Exclusive Club</p>
                        <p className="text-lg font-bold text-cyan-600">(99) 98139-2210</p>
                      </div>
                      <div className="p-3 bg-gray-50 rounded-lg border text-center">
                        <p className="font-semibold text-sm">Salvamar</p>
                        <p className="text-lg font-bold text-blue-600">185</p>
                      </div>
                      <div className="p-3 bg-gray-50 rounded-lg border text-center">
                        <p className="font-semibold text-sm">Bombeiros</p>
                        <p className="text-lg font-bold text-red-600">193</p>
                      </div>
                    </div>
                  </div>

                  {/* Condições Impeditivas */}
                  <div className="p-4 bg-red-50 rounded-lg border border-red-300">
                    <h3 className="font-semibold text-lg mb-2 text-red-900">
                      ⛔ NÃO NAVEGUE em caso de:
                    </h3>
                    <ul className="grid md:grid-cols-2 gap-2 text-sm text-red-800">
                      <li>⛈️ Previsão de tempestade ou raios</li>
                      <li>🌧️ Chuva forte (visibilidade reduzida)</li>
                      <li>💨 Ventos acima de 25 km/h</li>
                      <li>🌊 Ondas acima de 0,5 metros</li>
                      <li>🌫️ Neblina densa</li>
                      <li>🌙 Navegação noturna sem equipamentos</li>
                    </ul>
                    <p className="mt-3 text-sm font-semibold text-red-900">
                      O sistema enviará alertas automáticos quando houver condições desfavoráveis.
                    </p>
                  </div>

                  {/* Download Manual Completo */}
                  <div className="text-center pt-4">
                    <Button size="lg" className="gap-2">
                      <Download className="h-5 w-5" />
                      Baixar Manual Completo (PDF)
                    </Button>
                    <p className="text-sm text-muted-foreground mt-2">
                      Manual detalhado com todos os procedimentos e regras de segurança
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
