import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      // Cloudinary CDN — fonte principale per le immagini prodotto
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
      },
      // OpenFoodFacts — usato solo come sorgente nel sync-images, non in produzione
      {
        protocol: 'https',
        hostname: 'images.openfoodfacts.org',
      },
    ],
  },
};

export default withNextIntl(nextConfig);
