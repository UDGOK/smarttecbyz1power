export const prerender = true;
const paths = ['/', '/site', '/power', '/colocation', '/compute', '/model-planner', '/news', '/about', '/contact'];
export function GET() {
  const urls = paths.map(path => `<url><loc>https://www.smarttec.dev${path}</loc></url>`).join('');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}
