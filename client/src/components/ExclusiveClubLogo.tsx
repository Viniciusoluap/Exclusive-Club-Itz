import { useId } from "react";

interface ExclusiveClubLogoProps {
  size?: number;
  className?: string;
}

export function ExclusiveClubLogo({ size = 64, className }: ExclusiveClubLogoProps) {
  const uid = useId().replace(/:/g, "");
  const arcId = `ec-arc-${uid}`;

  const NAVY = "#1B3A5C";
  const STROKE = { fill: "none", stroke: NAVY, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Exclusive Club"
    >
      {/* ── Círculo branco + borda náutica ── */}
      <circle cx="100" cy="100" r="96" fill="white" stroke="#c0d4e8" strokeWidth="2.5" />
      <circle cx="100" cy="100" r="89" fill="none" stroke="#dce9f5" strokeWidth="0.8" />

      {/* ── Âncora ── */}
      <g {...STROKE}>
        {/* Anel superior */}
        <circle cx="100" cy="36" r="10" strokeWidth="3.2" />

        {/* Haste vertical */}
        <line x1="100" y1="46" x2="100" y2="116" strokeWidth="3.5" />

        {/* Travessa horizontal (stock) */}
        <line x1="66" y1="68" x2="134" y2="68" strokeWidth="3.5" />

        {/* Arco da coroa na base (conecta os braços) */}
        <path d="M 76 116 Q 100 128 124 116" strokeWidth="3.5" />

        {/* Braço esquerdo */}
        <path d="M 76 116 C 52 122 39 106 46 89" strokeWidth="3.5" />
        {/* Ponta/fluke esquerda */}
        <path d="M 46 89 L 34 84" strokeWidth="3" />
        <path d="M 46 89 L 40 78" strokeWidth="3" />

        {/* Braço direito (espelho) */}
        <path d="M 124 116 C 148 122 161 106 154 89" strokeWidth="3.5" />
        {/* Ponta/fluke direita */}
        <path d="M 154 89 L 166 84" strokeWidth="3" />
        <path d="M 154 89 L 160 78" strokeWidth="3" />
      </g>

      {/* ── "Exclusive Club" ── */}
      <text
        x="100"
        y="152"
        textAnchor="middle"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontSize="21"
        fill={NAVY}
        letterSpacing="0.5"
      >
        Exclusive Club
      </text>

      {/* ── Subtítulo curvo na base ── */}
      <defs>
        {/* Arco suave ao longo da parte inferior do círculo */}
        <path id={arcId} d="M 34 162 A 148 148 0 0 1 166 162" />
      </defs>
      <text
        fontFamily="Georgia, 'Times New Roman', serif"
        fontSize="9.5"
        fill={NAVY}
        letterSpacing="1"
      >
        <textPath href={`#${arcId}`} startOffset="50%" textAnchor="middle">
          Compartilhando Sonhos
        </textPath>
      </text>
    </svg>
  );
}
