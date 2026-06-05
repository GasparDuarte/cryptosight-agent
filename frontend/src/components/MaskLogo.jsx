// Neon cyan wireframe of a Payday-style heist mask with an integrated ₿ sigil.
// variant="logo" -> small header mark · variant="schematic" -> big targeting readout.
export default function MaskLogo({ size = 46, variant = 'logo' }) {
  const schematic = variant === 'schematic'
  return (
    <svg
      className={`mask-svg ${schematic ? 'mask-schematic' : 'mask-logo'}`}
      width={size}
      height={size * 1.12}
      viewBox="0 0 200 224"
      fill="none"
      role="img"
      aria-label="CryptoSight tactical mask"
    >
      {schematic && (
        <g className="mask-reticle" stroke="currentColor" fill="none">
          <circle cx="100" cy="112" r="106" strokeWidth="1" strokeDasharray="5 9" opacity="0.55" />
          <circle cx="100" cy="112" r="90" strokeWidth="1" strokeDasharray="2 7" opacity="0.35" />
          <line x1="100" y1="2" x2="100" y2="26" strokeWidth="1" />
          <line x1="100" y1="198" x2="100" y2="222" strokeWidth="1" />
          <line x1="2" y1="112" x2="26" y2="112" strokeWidth="1" />
          <line x1="174" y1="112" x2="198" y2="112" strokeWidth="1" />
        </g>
      )}

      <g
        className="mask-lines"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        fill="none"
      >
        {/* face shell */}
        <path d="M100,16 C151,16 176,50 176,98 C176,152 140,206 100,208 C60,206 24,152 24,98 C24,50 49,16 100,16 Z" />
        {/* cheek contour (wireframe) */}
        <path d="M40,104 C58,150 78,178 100,182 C122,178 142,150 160,104" opacity="0.5" />
        {/* brows */}
        <path d="M44,88 L90,78" />
        <path d="M156,88 L110,78" />
        {/* angular eyes */}
        <path d="M49,102 L88,90 L85,114 L54,120 Z" />
        <path d="M151,102 L112,90 L115,114 L146,120 Z" />
        {/* nose */}
        <path d="M100,122 L90,146 L110,146 Z" />
        {/* grin + teeth */}
        <path d="M66,162 Q100,192 134,162" />
        <path d="M75,167 L75,179" opacity="0.7" />
        <path d="M100,172 L100,184" opacity="0.7" />
        <path d="M125,167 L125,179" opacity="0.7" />
      </g>

      {/* bitcoin sigil on the forehead */}
      <text x="100" y="64" textAnchor="middle" className="mask-btc" fontSize="30" fontWeight="700">
        ₿
      </text>

      {schematic && (
        <line className="mask-scan" x1="24" y1="0" x2="176" y2="0" stroke="currentColor" strokeWidth="2" />
      )}
    </svg>
  )
}
