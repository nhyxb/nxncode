import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { realpathSync } from 'node:fs'
export default defineConfig({
 main: { plugins: [externalizeDepsPlugin()], build: { rollupOptions: { input: 'src/main/index.ts' } } },
 preload: { plugins: [externalizeDepsPlugin()], build: { rollupOptions: { input: 'src/preload/index.ts', output: { format: 'cjs', entryFileNames: 'index.cjs' } } } },
 renderer: { root: '.', plugins: [react()], server:{fs:{allow:[process.cwd(),realpathSync('node_modules')]}}, build: { rollupOptions: { input: 'index.html' } } }
})

