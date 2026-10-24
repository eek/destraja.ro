/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Site static: `next build` scrie paginile în out/, de unde le servește Cloudflare.
  output: 'export',
  images: { unoptimized: true },
  // Permite un build de producție în paralel cu `next dev`, fără să-și calce fișierele.
  distDir: process.env.NEXT_DIST_DIR || '.next',
};

export default nextConfig;
