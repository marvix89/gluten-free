interface CategoryIconProps {
  category: string;
  size?: number;
  className?: string;
}

export default function CategoryIcon({ category, size = 24, className }: CategoryIconProps) {
  const props = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
    'aria-hidden': true,
  };

  switch (category) {
    // 🌾 Cereali Alternativi – spiga di grano
    case 'cereali-alternativi':
      return (
        <svg {...props}>
          <path d="M12 21V10" stroke="currentColor" />
          <path d="M9 10c0-2 1.5-4 3-5 1.5 1 3 3 3 5" stroke="currentColor" />
          <path d="M9 14c-2 0-4-1-5-3 1-2 3-2.5 5-2" stroke="currentColor" />
          <path d="M15 14c2 0 4-1 5-3-1-2-3-2.5-5-2" stroke="currentColor" />
          <path d="M9 17.5c-2 0-4-.5-5-2.5 1-1.5 3-2 5-1.5" stroke="currentColor" />
          <path d="M15 17.5c2 0 4-.5 5-2.5-1-1.5-3-2-5-1.5" stroke="currentColor" />
        </svg>
      );

    // 🍝 Pasta & Riso – spaghetti arrotolati
    case 'pasta-riso':
      return (
        <svg {...props}>
          <path d="M4 8c4-2 8 2 12 0" stroke="currentColor" />
          <path d="M4 12c4-2 8 2 12 0" stroke="currentColor" />
          <path d="M4 16c4-2 8 2 12 0" stroke="currentColor" />
          <ellipse cx="12" cy="20" rx="8" ry="1.5" stroke="currentColor" />
        </svg>
      );

    // 🍞 Pane & Prodotti da Forno – pagnotta
    case 'pane-prodotti-da-forno':
      return (
        <svg {...props}>
          <path d="M4 13a8 4 0 0 1 16 0v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-5Z" stroke="currentColor" />
          <path d="M4 13a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4" stroke="currentColor" />
          <path d="M8 13v5" stroke="currentColor" strokeOpacity="0.4" />
          <path d="M12 11v7" stroke="currentColor" strokeOpacity="0.4" />
          <path d="M16 13v5" stroke="currentColor" strokeOpacity="0.4" />
        </svg>
      );

    // 🍪 Dolci & Biscotti – biscotto
    case 'dolci-biscotti':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="8.5" stroke="currentColor" />
          <circle cx="9" cy="10" r="1" fill="currentColor" />
          <circle cx="14" cy="9" r="0.8" fill="currentColor" />
          <circle cx="10.5" cy="13.5" r="0.8" fill="currentColor" />
          <circle cx="15" cy="13" r="1" fill="currentColor" />
          <circle cx="12" cy="16" r="0.7" fill="currentColor" />
        </svg>
      );

    // 🍳 Piatti Pronti – piatto con coperchio
    case 'piatti-pronti':
      return (
        <svg {...props}>
          <path d="M4 14a8 8 0 0 1 16 0" stroke="currentColor" />
          <path d="M3 14h18" stroke="currentColor" />
          <path d="M8 14v2.5" stroke="currentColor" />
          <path d="M16 14v2.5" stroke="currentColor" />
          <path d="M5 16.5h14" stroke="currentColor" />
          <path d="M12 6v3" stroke="currentColor" />
          <path d="M10.5 6.5 12 6l1.5.5" stroke="currentColor" />
        </svg>
      );

    // 🥨 Snack Salati – pretzel
    case 'snack-salati':
      return (
        <svg {...props}>
          <path d="M9 6a3 3 0 0 1 6 0c0 4-6 4-6 8a3 3 0 0 0 6 0" stroke="currentColor" />
          <path d="M6 10.5A3.5 3.5 0 0 0 12 14" stroke="currentColor" />
          <path d="M18 10.5A3.5 3.5 0 0 1 12 14" stroke="currentColor" />
          <circle cx="8.5" cy="17.5" r="1" fill="currentColor" />
          <circle cx="15.5" cy="17.5" r="1" fill="currentColor" />
        </svg>
      );

    // ⭐ Personalizzato – stella
    case 'personalizzato':
      return (
        <svg {...props}>
          <path
            d="M12 2l2.7 8.5H23l-7 5 2.7 8.5L12 19l-6.7 5 2.7-8.5-7-5h8.3L12 2Z"
            stroke="currentColor"
          />
        </svg>
      );

    // Fallback generico – pacchetto
    default:
      return (
        <svg {...props}>
          <rect x="3" y="6" width="18" height="14" rx="1.5" stroke="currentColor" />
          <path d="M3 10h18" stroke="currentColor" />
          <path d="M9 10v10" stroke="currentColor" />
        </svg>
      );
  }
}
