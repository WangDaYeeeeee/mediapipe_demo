import { defineConfig } from 'vite'
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig({
  base: '/mediapipe_demo/',
  server: {
    host: '0.0.0.0',
    port: 3000,
    https: true, // 启用HTTPS，Vite会自动生成自签名证书
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin'
    }
  },
  plugins: [
    basicSsl()
  ],
  build: {
    outDir: 'dist',
    assetsDir: 'assets'
  },
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util']
  }
})