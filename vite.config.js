import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig({
  plugins:[
    react(),
    VitePWA({
      registerType:'autoUpdate',
      injectRegister:'auto',
      manifest:false,
      workbox:{
        cleanupOutdatedCaches:true,
        clientsClaim:true,
        skipWaiting:true,
        navigateFallback:'/index.html',
        navigateFallbackDenylist:[/^\/api\\//],
        runtimeCaching:[
          {
            urlPattern:({request})=>request.mode==='navigate',
            handler:'NetworkFirst',
            options:{
              cacheName:'jeffco-pages',
              networkTimeoutSeconds:3,
              expiration:{
                maxEntries:10,
                maxAgeSeconds:86400
              }
            }
          }
        ]
      }
    })
  ],
  build:{
    sourcemap:false
  }
});
