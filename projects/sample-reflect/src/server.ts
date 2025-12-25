import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { join } from 'node:path';
import { extractPreviewImage } from './url-metadata';
// Optional: use an outbound HTTP proxy if configured via environment variables.
// This helps when target sites block datacenter IPs or require region-specific access.
let proxyDispatcher: any = null;
try {
  const httpProxy = process.env['HTTP_PROXY'] || process.env['http_proxy'] || process.env['HTTPS_PROXY'] || process.env['https_proxy'];
  if (httpProxy) {
    // Lazy import undici's ProxyAgent only when needed
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { ProxyAgent } = require('undici');
    proxyDispatcher = new ProxyAgent(httpProxy);
    console.log('[url-metadata] Using outbound proxy:', httpProxy);
  }
} catch (e) {
  // If undici ProxyAgent is unavailable, proceed without a proxy
}

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();

/**
 * API endpoint to fetch URL metadata (og:image, etc.)
 */
app.get('/api/url-metadata', async (req, res) => {
  const url = req.query['url'] as string;
  
  if (!url) {
    return res.status(400).json({ error: 'URL parameter is required' });
  }

  // Validate URL format and restrict to HTTP/HTTPS only
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return res.status(400).json({ error: 'Only HTTP and HTTPS URLs are allowed' });
    }
    
    // Block localhost, private IPs, and internal networks to prevent SSRF
    const hostname = parsedUrl.hostname.toLowerCase();
    if (
      hostname === 'localhost' ||
      hostname.startsWith('127.') ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('10.') ||
      hostname.match(/^172\.(1[6-9]|2[0-9]|3[01])\./)
    ) {
      return res.status(400).json({ error: 'Cannot fetch from internal/private networks' });
    }
  } catch (error) {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  try {
    // Fetch the URL with a 10 second timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    const response = await fetch(url, {
      headers: {
        // Mimic a modern desktop browser UA to avoid basic bot blocking
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7',
      },
      signal: controller.signal,
      // Use outbound proxy when configured (undici extension not in RequestInit type)
      ...(proxyDispatcher && { dispatcher: proxyDispatcher }),
    } as any);
    
    clearTimeout(timeoutId);

    if (!response.ok) {
      // Do not propagate upstream status codes (e.g., 402/403/5xx).
      // Always respond with 200 JSON so the client can gracefully handle null og:image
      // without surfacing proxy/server errors in the UI.
      return res.status(200).json({ ogImage: null, error: 'bad_status', status: response.status });
    }

    const html = await response.text();
    const ogImage = extractPreviewImage(html, parsedUrl.toString());
    return res.json({ ogImage: ogImage ?? null });
  } catch (error) {
    console.error('Error fetching URL metadata:', error);
    // Return 200 with ogImage: null so the client can gracefully fall back
    return res.status(200).json({ ogImage: null, error: 'fetch_failed' });
  }
});

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
