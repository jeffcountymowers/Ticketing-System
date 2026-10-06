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
        navigateFallback:'/index.html'
      }
    })
  ],
  build:{
    sourcemap:false
  }
});
