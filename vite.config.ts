import { defineConfig } from 'vite'

// Relative asset paths let the same build run from the site root (local
// preview) and from a subfolder (GitHub Pages serves it under /secret_game/).
export default defineConfig({ base: './' })
