// Génère les icônes PWA et l'image de partage à partir de public/favicon.svg
import sharp from 'sharp'
import { readFileSync } from 'node:fs'
const svg = readFileSync('public/favicon.svg')
// maskable: shrink artwork into safe zone
const maskSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#0B5D43"/><g transform="translate(77 77) scale(.7)">${svg.toString().replace(/<svg[^>]*>|<\/svg>/g,'').replace('<rect width="512" height="512" rx="120" fill="#0B5D43"/>','')}</g></svg>`
await sharp(svg).resize(192).png().toFile('public/pwa-192x192.png')
await sharp(svg).resize(512).png().toFile('public/pwa-512x512.png')
await sharp(Buffer.from(maskSvg)).resize(512).png().toFile('public/maskable-512x512.png')
await sharp(Buffer.from(maskSvg)).resize(180).png().toFile('public/apple-touch-icon.png')
const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#0B5D43"/><circle cx="1050" cy="80" r="260" fill="#11745A"/><circle cx="120" cy="600" r="200" fill="#0E6A4E"/><g transform="translate(110 175) scale(.55)">${svg.toString().replace(/<svg[^>]*>|<\/svg>/g,'').replace('fill="#0B5D43"/>','fill="#0B5D43" opacity="0"/>')}</g><text x="430" y="300" font-family="DejaVu Sans, Arial, sans-serif" font-weight="700" font-size="104" fill="#FBF8F3">Barkelou</text><text x="434" y="380" font-family="DejaVu Sans, Arial, sans-serif" font-size="38" fill="#F2B33D">Ensemble, on va plus loin.</text></svg>`
await sharp(Buffer.from(og)).png().toFile('public/og-image.png')
console.log('Icônes Barkelou générées ✓')
