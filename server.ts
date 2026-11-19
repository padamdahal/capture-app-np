import express, { type Request, type Response } from 'express';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath, pathToFileURL } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

function isBlockedHost(hostname: string): boolean {
    const lower = hostname.toLowerCase();
    return (
        lower === '169.254.169.254' ||
        lower === 'metadata.google.internal' ||
        lower === '0.0.0.0' ||
        lower === 'localhost' ||
        lower === '127.0.0.1' ||
        lower === '::1'
    );
}

function getCookieValue(cookieHeader: string | undefined, name: string): string {
    if (!cookieHeader) return '';
    const parts = cookieHeader.split(';');
    for (const part of parts) {
        const idx = part.indexOf('=');
        if (idx === -1) continue;
        const key = part.slice(0, idx).trim();
        if (key === name) {
            try {
                return decodeURIComponent(part.slice(idx + 1).trim());
            } catch {
                return part.slice(idx + 1).trim();
            }
        }
    }
    return '';
}

function filterOutgoingCookies(cookieHeader: string | undefined): string {
    if (!cookieHeader) return '';
    return cookieHeader
        .split(';')
        .map(v => v.trim())
        .filter(v => v && !v.startsWith('dhis2_proxy_target='))
        .join('; ');
}

function rewriteSetCookie(rawCookie: string, isHttps: boolean): string {
    const parts = rawCookie
        .split(';')
        .map(p => p.trim())
        .filter(Boolean)
        .filter((p) => {
            const lower = p.toLowerCase();
            return (
                !lower.startsWith('domain=') &&
                !lower.startsWith('path=') &&
                !lower.startsWith('samesite=') &&
                lower !== 'secure'
            );
        });

    parts.push('Path=/');
    if (isHttps) {
        parts.push('SameSite=None');
        parts.push('Secure');
    } else {
        parts.push('SameSite=Lax');
    }
    return parts.join('; ');
}

function readRawBody(req: Request): Promise<Buffer | undefined> {
    if (req.method === 'GET' || req.method === 'HEAD') {
        return Promise.resolve(undefined);
    }
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => resolve(chunks.length > 0 ? Buffer.concat(chunks) : undefined));
        req.on('error', reject);
    });
}

async function createDhis2DevViteMiddleware() {
    const cliRoot = path.join(__dirname, 'node_modules/@dhis2/cli-app-scripts');
    const bootstrapShell = require(path.join(cliRoot, 'src/lib/bootstrapShell.js'));
    const {
        verifyEntrypoints,
        createAppEntrypointWrapper,
        createPluginEntrypointWrapper,
    } = require(path.join(cliRoot, 'src/lib/compiler/entrypoints.js'));
    const { loadEnvFiles, getEnv } = require(path.join(cliRoot, 'src/lib/env'));
    const generateManifests = require(path.join(cliRoot, 'src/lib/generateManifests.js'));
    const parseConfig = require(path.join(cliRoot, 'src/lib/parseConfig.js'));
    const makePaths = require(path.join(cliRoot, 'src/lib/paths.js'));
    const i18n = require(path.join(cliRoot, 'src/lib/i18n'));

    const cwd = __dirname;
    if (
        !fs.existsSync(path.join(cwd, 'src', 'index.tsx')) ||
        !fs.existsSync(path.join(cwd, 'packages', 'rules-engine', 'build'))
    ) {
        console.log('Restoring missing capture-app v107.9.3 baseline files...');
        execSync(
            'rm -rf /tmp/capture-app-v107 && git clone --branch v107.9.3 --depth 1 https://github.com/dhis2/capture-app /tmp/capture-app-v107 && cp -rn /tmp/capture-app-v107/src/. ./src/ && cp -rn /tmp/capture-app-v107/packages/. ./packages/ && cp -rn /tmp/capture-app-v107/config/. ./config/ && cp -rn /tmp/capture-app-v107/public/. ./public/ && cp -rn /tmp/capture-app-v107/scripts/. ./scripts/ && rm -rf /tmp/capture-app-v107 && node scripts/createSymlinkToInternalPackages.mjs && npm run build --workspace=packages/rules-engine',
            { cwd, stdio: 'inherit' },
        );
    }
    const typeScript = fs.existsSync(path.join(cwd, 'tsconfig.json'));
    const paths = makePaths(cwd, { typeScript });
    const mode = 'development';
    process.env.BABEL_ENV = process.env.NODE_ENV = mode;
    loadEnvFiles(paths, mode);
    if (!process.env.DHIS2_CACHE_VERSION) {
        try {
            const pkgJson = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
            process.env.DHIS2_CACHE_VERSION = String(pkgJson.cacheVersion || '4');
        } catch {
            process.env.DHIS2_CACHE_VERSION = '4';
        }
    }

    const config = parseConfig(paths);

    await i18n.extract({
        input: paths.src,
        output: paths.i18nStrings,
        paths,
    });
    await i18n.generate({
        input: paths.i18nStrings,
        output: paths.i18nLocales,
        namespace: 'default',
        paths,
    });

    await bootstrapShell({ paths, force: false });

    verifyEntrypoints({ config, paths });
    if (config.entryPoints?.app) {
        await createAppEntrypointWrapper({
            entrypoint: config.entryPoints.app,
            paths,
        });
    }
    if (config.entryPoints?.plugin) {
        await createPluginEntrypointWrapper({
            entrypoint: config.entryPoints.plugin,
            paths,
        });
    }

    fs.rmSync(paths.shellApp, { recursive: true, force: true });
    fs.mkdirSync(paths.shellApp, { recursive: true });
    fs.cpSync(paths.src, paths.shellApp, { recursive: true, force: true });

    fs.rmSync(paths.shellPublic, { recursive: true, force: true });
    if (fs.existsSync(paths.shellSourcePublic)) {
        fs.cpSync(paths.shellSourcePublic, paths.shellPublic, { recursive: true, force: true });
    }
    if (fs.existsSync(paths.public)) {
        fs.cpSync(paths.public, paths.shellPublic, { recursive: true, force: true });
    }

    await generateManifests(paths, config, process.env.PUBLIC_URL);

    const env = getEnv({ config, publicUrl: '.' });
    const makeViteConfigUrl = pathToFileURL(path.join(cliRoot, 'config/makeViteConfig.mjs')).href;
    const { default: createViteConfig } = await import(makeViteConfigUrl);
    const viteConfig = await createViteConfig({
        config,
        paths,
        env,
        mode,
        host: '0.0.0.0',
        force: false,
        allowJsxInJs: false,
    });

    const { createServer } = await import('vite');
    const vite = await createServer({
        ...viteConfig,
        server: {
            ...viteConfig.server,
            middlewareMode: true,
            hmr: false,
        },
        appType: 'spa',
    });
    return vite;
}

async function startServer(): Promise<void> {
    const app = express();
    app.set('trust proxy', true);

    app.get('/api/health', (_req: Request, res: Response) => {
        res.json({ ok: true, service: 'capture-app-np-proxy' });
    });

    app.get('/api/download/capture-app-np-107.9.3.zip', (_req: Request, res: Response) => {
        const bundleDir = path.resolve(__dirname, 'build', 'bundle');
        const zipPath = path.join(bundleDir, 'capture-app-np-107.9.3.zip');
        if (!fs.existsSync(zipPath)) {
            res.status(404).json({ error: 'Bundle zip not found. Run npm run build:zip first.' });
            return;
        }
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', 'attachment; filename="capture-app-np-107.9.3.zip"');
        res.sendFile(zipPath);
    });

    app.use('/_dhis2_proxy', async (req: Request, res: Response) => {
        const headerTarget = typeof req.headers['x-dhis2-target'] === 'string'
            ? req.headers['x-dhis2-target'].trim()
            : '';
        const cookieTarget = getCookieValue(req.headers.cookie, 'dhis2_proxy_target');
        const rawBaseUrl = (headerTarget || cookieTarget).replace(/\/+$/, '');

        if (!rawBaseUrl) {
            res.status(400).json({ error: 'Missing DHIS2 target server URL.' });
            return;
        }

        let parsedBase: URL;
        try {
            parsedBase = new URL(rawBaseUrl);
        } catch {
            res.status(400).json({ error: 'Invalid DHIS2 server URL.' });
            return;
        }

        if (parsedBase.protocol !== 'http:' && parsedBase.protocol !== 'https:') {
            res.status(400).json({ error: 'Only http and https DHIS2 server URLs are supported.' });
            return;
        }

        if (isBlockedHost(parsedBase.hostname)) {
            res.status(403).json({ error: 'Target host is blocked by proxy policy.' });
            return;
        }

        const suffix = req.originalUrl.replace(/^\/_dhis2_proxy/, '') || '/';
        const targetUrl = `${rawBaseUrl}${suffix.startsWith('/') ? suffix : `/${suffix}`}`;

        const forwardHeaders: Record<string, string> = {};
        for (const [key, val] of Object.entries(req.headers)) {
            if (!val) continue;
            const lower = key.toLowerCase();
            if (
                lower === 'host' ||
                lower === 'connection' ||
                lower === 'content-length' ||
                lower === 'origin' ||
                lower === 'referer' ||
                lower === 'x-dhis2-target' ||
                lower === 'accept-encoding'
            ) {
                continue;
            }
            if (lower === 'cookie') {
                const cleaned = filterOutgoingCookies(Array.isArray(val) ? val.join('; ') : val);
                if (cleaned) {
                    forwardHeaders.cookie = cleaned;
                }
                continue;
            }
            forwardHeaders[key] = Array.isArray(val) ? val.join(', ') : val;
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);

        try {
            const bodyBuffer = await readRawBody(req);
            const upstream = await fetch(targetUrl, {
                method: req.method,
                headers: forwardHeaders,
                body: bodyBuffer ? new Uint8Array(bodyBuffer) : undefined,
                redirect: 'manual',
                signal: controller.signal,
            });

            res.status(upstream.status);

            const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
            const headersWithCookies = upstream.headers as unknown as {
                getSetCookie?: () => string[];
            };
            const setCookies = typeof headersWithCookies.getSetCookie === 'function'
                ? headersWithCookies.getSetCookie()
                : [];

            upstream.headers.forEach((value, key) => {
                const lower = key.toLowerCase();
                if (
                    lower === 'set-cookie' ||
                    lower === 'content-encoding' ||
                    lower === 'content-length' ||
                    lower === 'transfer-encoding' ||
                    lower === 'access-control-allow-origin' ||
                    lower === 'access-control-allow-credentials'
                ) {
                    return;
                }
                if (lower === 'location' && value.startsWith(rawBaseUrl)) {
                    const rel = value.slice(rawBaseUrl.length) || '/';
                    res.setHeader('location', `/_dhis2_proxy${rel.startsWith('/') ? rel : `/${rel}`}`);
                    return;
                }
                res.setHeader(key, value);
            });

            if (setCookies.length > 0) {
                res.setHeader(
                    'set-cookie',
                    setCookies.map(c => rewriteSetCookie(c, isHttps)),
                );
            }

            const respBuffer = Buffer.from(await upstream.arrayBuffer());
            res.send(respBuffer);
        } catch (err) {
            const message =
                err instanceof Error && err.name === 'AbortError'
                    ? 'DHIS2 server request timed out after 30 seconds.'
                    : err instanceof Error
                        ? err.message
                        : 'Failed to reach DHIS2 server.';
            res.status(502).json({ error: message });
        } finally {
            clearTimeout(timeout);
        }
    });

    if (!IS_PRODUCTION) {
        const vite = await createDhis2DevViteMiddleware();
        app.use(vite.middlewares);
    } else {
        const distDir = path.resolve(__dirname, 'build', 'app');
        app.use(express.static(distDir));
        app.get('*', (_req: Request, res: Response) => {
            const indexHtml = path.join(distDir, 'index.html');
            if (fs.existsSync(indexHtml)) {
                res.sendFile(indexHtml);
            } else {
                res.status(404).send('Build output not found. Run npm run build first.');
            }
        });
    }

    app.listen(PORT, '0.0.0.0', () => {
        console.log(`DHIS2 Capture server running on http://0.0.0.0:${PORT}`);
    });
}

startServer().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
});
