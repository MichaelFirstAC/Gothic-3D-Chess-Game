import { defineConfig, loadEnv } from 'vite';

// Server-only settings. None has the VITE_ prefix, so none reaches the browser.
const SERVER_KEYS = ['GROQ_API_KEY', 'GROQ_MODEL', 'CHESSCOM_CONTACT'];
const ROUTES = { '/api/explain': './api/explain.js', '/api/chesscom': './api/chesscom.js' };

// Serves the Vercel functions during `npm run dev` and `npm run preview`.
function apiRoutes() {
  const mount = (server, load) => {
    for (const [route, file] of Object.entries(ROUTES)) {
      server.middlewares.use(route, async (req, res) => {
        try {
          const { default: handler } = await load(file);
          await handler(req, res);
        } catch (error) {
          server.config.logger.error(`${route}: ${error.stack || error}`);
          res.statusCode = 500;
          res.end();
        }
      });
    }
  };
  return {
    name: 'api-routes',
    configureServer: (server) => mount(server, (file) => server.ssrLoadModule(file)),
    configurePreviewServer: (server) => mount(server, (file) => import(new URL(file, import.meta.url))),
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  for (const key of SERVER_KEYS) {
    if (env[key]) process.env[key] ||= env[key];
  }
  return { plugins: [apiRoutes()] };
});
