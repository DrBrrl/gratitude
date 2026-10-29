import { base } from '$app/paths';

export const prerender = true;
export function GET() {
  return new Response(JSON.stringify({
    id: `${base}/`, name: 'Gratitude', short_name: 'Gratitude',
    start_url: `${base}/journal/`, scope: `${base}/`, display: 'standalone',
    background_color: '#0c0d10', theme_color: '#0c0d10',
    icons: [192, 512].map(size => ({ src: `${base}/icons/gratitude-${size}.png`, sizes: `${size}x${size}`, type: 'image/png', purpose: 'any' }))
  }), { headers: { 'Content-Type': 'application/manifest+json' } });
}
