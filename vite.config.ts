import { defineConfig } from 'vite'
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 3000,
    https: true // 启用HTTPS，Vite会自动生成自签名证书
  },
  plugins: [
    basicSsl()
  ],
  build: {
    outDir: 'dist',
    assetsDir: 'assets'
  }
})