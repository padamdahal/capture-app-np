import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';

const dhis2ProxyShimPlugin = (): Plugin => ({
    name: 'dhis2-iframe-proxy-shim',
    transformIndexHtml(html: string) {
        const shim = `<script>
(function () {
  if (typeof window === 'undefined' || window.__dhis2ProxyShimInstalled) return;
  window.__dhis2ProxyShimInstalled = true;

  var nativeFetch = window.fetch.bind(window);

  function setTargetCookie(base) {
    try {
      var secure = window.location.protocol === 'https:' ? '; SameSite=None; Secure' : '; SameSite=Lax';
      document.cookie = 'dhis2_proxy_target=' + encodeURIComponent(base) + '; path=/' + secure;
    } catch (_) {}
  }

  function resolveProxyTarget(rawUrl) {
    if (typeof rawUrl !== 'string' || !/^https?:\\/\\//i.test(rawUrl)) return null;
    try {
      var parsed = new URL(rawUrl);
      if (parsed.origin === window.location.origin) return null;

      var storedBase = '';
      try {
        storedBase = (window.localStorage.getItem('DHIS2_BASE_URL') || '').replace(/\\/+$/, '');
      } catch (_) {}

      if (storedBase && rawUrl.indexOf(storedBase) === 0) {
        var rest = rawUrl.slice(storedBase.length) || '/';
        if (!rest.startsWith('/')) rest = '/' + rest;
        return { base: storedBase, rewrittenUrl: '/_dhis2_proxy' + rest };
      }

      var match = parsed.pathname.match(/^(.*?)(?:\\/api\\/|\\/dhis-web-|\\/icons\\/|\\/images\\/|\\/login\\.action)/);
      if (match) {
        var base = parsed.origin + match[1];
        var remainder = parsed.pathname.slice(match[1].length) + parsed.search;
        return { base: base, rewrittenUrl: '/_dhis2_proxy' + remainder };
      }
    } catch (_) {}
    return null;
  }

  window.fetch = function (input, init) {
    var rawUrl = typeof input === 'string' ? input : (input && input.url) || '';
    var resolved = resolveProxyTarget(rawUrl);
    if (!resolved) {
      return nativeFetch(input, init);
    }

    setTargetCookie(resolved.base);
    var headers = new Headers((init && init.headers) || (input instanceof Request ? input.headers : undefined));
    headers.set('x-dhis2-target', resolved.base);

    var nextInit = Object.assign({}, init || {}, {
      headers: headers,
      credentials: 'same-origin',
    });

    if (typeof input === 'string') {
      return nativeFetch(resolved.rewrittenUrl, nextInit);
    }
    var clonedReq = new Request(resolved.rewrittenUrl, {
      method: input.method,
      headers: headers,
      body: input.method !== 'GET' && input.method !== 'HEAD' ? init && init.body : undefined,
      credentials: 'same-origin',
    });
    return nativeFetch(clonedReq, nextInit);
  };

  var origOpen = XMLHttpRequest.prototype.open;
  var origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url, async, user, password) {
    var resolved = resolveProxyTarget(String(url || ''));
    if (resolved) {
      this.__dhis2TargetBase = resolved.base;
      setTargetCookie(resolved.base);
      return origOpen.call(this, method, resolved.rewrittenUrl, async !== false, user, password);
    }
    this.__dhis2TargetBase = null;
    return origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function (body) {
    if (this.__dhis2TargetBase) {
      try {
        this.withCredentials = true;
        this.setRequestHeader('x-dhis2-target', this.__dhis2TargetBase);
      } catch (_) {}
    }
    return origSend.call(this, body);
  };
})();
</script>`;
        return html.replace('</head>', `${shim}\n</head>`);
    },
});

const viteConfig = defineConfig((configEnv) => {
    const { mode } = configEnv;
    return {
        clearScreen: mode !== 'development',
        plugins: [dhis2ProxyShimPlugin()],
        resolve: {
            alias: {
                'capture-core': path.resolve(__dirname, 'src/core_modules/capture-core'),
                'capture-ui': path.resolve(__dirname, 'src/core_modules/capture-ui'),
                'capture-core-utils': path.resolve(__dirname, 'src/core_modules/capture-core-utils'),
                '@dhis2/rules-engine-javascript': path.resolve(__dirname, 'packages/rules-engine/src'),
            },
        },
        define: {
            global: 'window',
            'process.env.DHIS2_CACHE_VERSION': JSON.stringify(process.env.DHIS2_CACHE_VERSION || '4'),
        },
        build: {
            sourcemap: false,
            minify: false,
            rollupOptions: {
                maxParallelFileOps: 1,
            },
        },
        optimizeDeps: {
            include: [
                'react',
                'react-dom',
                'react-router-dom',
                'history',
                'prop-types',
                'redux',
                'react-redux',
                'redux-observable',
                'redux-batched-actions',
                'reselect',
                'rxjs',
                '@tanstack/react-query',
                '@tanstack/react-query-devtools',
                '@dhis2/ui',
                '@dhis2/app-runtime',
                '@dhis2/rule-engine',
                '@dhis2/d2-i18n',
                '@dhis2/d2-ui-rich-text',
                'leaflet',
                'leaflet-draw',
                'react-leaflet',
                'react-leaflet-draw',
                'react-leaflet-search-unpolyfilled',
                'lodash',
                'uuid',
                'moment',
                'date-fns',
                'nepali-date-converter',
                'loglevel',
                'query-string',
                '@emotion/react',
                '@emotion/react/jsx-dev-runtime',
                '@emotion/css',
                'react-jss',
                '@popperjs/core',
                'react-popper',
                'react-select',
                'react-dnd',
                'react-dnd-html5-backend',
                'react-html-parser-ultimate',
                'react-transform-tree',
                'd2-utilizr',
            ],
            esbuildOptions: {
                target: 'esnext',
            },
        },
        server: {
            host: '0.0.0.0',
            port: 3000,
            allowedHosts: true,
            hmr: process.env.DISABLE_HMR !== 'true',
            watch: process.env.DISABLE_HMR === 'true' ? null : {
                ignored: ['**/node_modules/**', '**/.d2/**'],
            },
            fs: {
                cachedChecks: true,
                strict: false,
            },
        },
        css: {
            devSourcemap: false,
        },
    };
});

export default viteConfig;
