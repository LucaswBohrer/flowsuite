import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// base './' + singlefile: o build gera UM dist/index.html que abre
// direto no navegador (Chrome/Edge), sem servidor e sem CORS de
// módulos externos — que é o que quebrava abrir o app anterior
// como anexo ou via file://.
export default defineConfig({
  base: './',
  plugins: [react(), viteSingleFile()],
});
