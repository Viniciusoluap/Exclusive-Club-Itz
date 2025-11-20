import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { APP_LOGO } from "@/const";
import { ShieldX } from "lucide-react";
import { Link } from "wouter";

export default function AccessDenied() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30">
      <Card className="max-w-md w-full mx-4">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
            <ShieldX className="h-8 w-8 text-destructive" />
          </div>
          <CardTitle className="text-2xl">Acesso Não Autorizado</CardTitle>
          <CardDescription className="text-base">
            Seu email não está cadastrado no sistema de reservas da Exclusive Club.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-muted p-4 rounded-lg">
            <p className="text-sm text-muted-foreground">
              Para ter acesso ao sistema de reservas, você precisa ser um cliente cadastrado. Entre em
              contato com o administrador para solicitar o cadastro do seu email.
            </p>
          </div>

          <div className="space-y-2">
            <h4 className="font-semibold text-sm">Informações de Contato:</h4>
            <p className="text-sm text-muted-foreground">
              Rua Leôncio Pires Dourado 840-A, Bacuri
              <br />
              Imperatriz - MA
            </p>
          </div>

          <Link href="/">
            <Button className="w-full">
              <img src={APP_LOGO} alt="Logo" className="h-5 w-5 mr-2" />
              Voltar ao Início
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
