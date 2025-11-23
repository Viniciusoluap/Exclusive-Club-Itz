import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { Star } from "lucide-react";

export function ReviewsSection() {
  // @ts-ignore - tRPC types will regenerate
  const { data: reviews, isLoading } = trpc.reviews.listApproved.useQuery();

  if (isLoading || !reviews || reviews.length === 0) {
    return null;
  }

  const renderStars = (rating: number) => {
    return Array.from({ length: 5 }).map((_, i) => (
      <Star
        key={i}
        className={`h-4 w-4 ${
          i < rating ? "fill-yellow-400 text-yellow-400" : "text-gray-300"
        }`}
      />
    ));
  };

  return (
    <section className="py-16 bg-gray-50">
      <div className="container">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            O Que Nossos Clientes Dizem
          </h2>
          <p className="text-gray-600">
            Experiências reais de quem já navegou conosco
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {reviews.slice(0, 6).map((review: any) => (
            <Card key={review.id} className="hover:shadow-lg transition-shadow">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-3">
                  {renderStars(review.rating)}
                </div>
                <p className="text-gray-700 mb-4 line-clamp-4">
                  {review.comment || "Excelente experiência!"}
                </p>
                <div className="border-t pt-4">
                  <p className="font-semibold text-gray-900">{review.clientName}</p>
                  <p className="text-sm text-gray-500">{review.vesselName}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {new Date(review.createdAt).toLocaleDateString("pt-BR")}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
