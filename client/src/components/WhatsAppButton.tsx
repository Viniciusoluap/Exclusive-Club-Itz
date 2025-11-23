import { MessageCircle } from "lucide-react";

/**
 * Botão flutuante do WhatsApp que aparece em todas as páginas
 * Redireciona para conversa com o número configurado
 */
export default function WhatsAppButton() {
  const phoneNumber = "5599981392210"; // Formato internacional: código país + DDD + número
  const message = "Olá! Gostaria de saber mais sobre o Exclusive Club.";
  
  const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;

  return (
    <a
      href={whatsappUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-green-500 text-white shadow-lg transition-all hover:scale-110 hover:bg-green-600 hover:shadow-xl"
      aria-label="Falar no WhatsApp"
    >
      <MessageCircle className="h-7 w-7" />
    </a>
  );
}
