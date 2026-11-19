/** @type {import('@dhis2/cli-app-scripts').D2Config} */
const config = {
    name: 'capture-app-np',
    title: 'Capture NP',
    type: 'app',
    direction: 'auto',
    id: 'c4f7a91e-8d2b-4f63-9a5c-7e1b3d0f82a4',
    minDHIS2Version: '2.41',
    coreApp: false,

    entryPoints: {
        app: './src/index.tsx',
    },
    shortcuts: [
        {
            name: 'Search TEI',
            url: '#/search',
        },
    ],

    viteConfigExtensions: './vite.config.mts',
};

module.exports = config;
