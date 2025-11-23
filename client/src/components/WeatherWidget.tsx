import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Cloud, Droplets, Wind, AlertTriangle, Loader2 } from "lucide-react";

interface WeatherWidgetProps {
  date: Date;
}

export function WeatherWidget({ date }: WeatherWidgetProps) {
  const { data: forecast, isLoading, error } = trpc.weather.forecast.useQuery({
    date: date.getTime(),
  });

  if (isLoading) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Cloud className="h-4 w-4" />
            Previsão do Tempo
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-4">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (error || !forecast) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Cloud className="h-4 w-4" />
            Previsão do Tempo
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Não foi possível carregar a previsão do tempo.
          </p>
        </CardContent>
      </Card>
    );
  }

  const hasRainAlert = forecast.humidity > 80; // Usar umidade como proxy para probabilidade de chuva
  const hasWindAlert = forecast.windSpeed > 25;
  const isFavorable = !hasRainAlert && !hasWindAlert;

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Cloud className="h-4 w-4" />
          Previsão do Tempo
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{forecast.emoji}</span>
            <div>
              <p className="font-medium">{forecast.temperature}°C</p>
              <p className="text-xs text-muted-foreground capitalize">
                {forecast.description}
              </p>
            </div>
          </div>
          
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs">
              <Droplets className="h-3 w-3" />
              <span>Umidade: {forecast.humidity}%</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <Wind className="h-3 w-3" />
              <span>Vento: {forecast.windSpeed} km/h</span>
            </div>

          </div>
        </div>

        {!isFavorable && (
          <Alert variant="destructive" className="py-2">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              {hasRainAlert && "Alta probabilidade de chuva. "}
              {hasWindAlert && "Ventos fortes previstos. "}
              Condições desfavoráveis para navegação.
            </AlertDescription>
          </Alert>
        )}

        {isFavorable && (
          <div className="text-xs text-center text-green-600 dark:text-green-400 font-medium">
            ✓ Condições favoráveis para navegação
          </div>
        )}
      </CardContent>
    </Card>
  );
}
