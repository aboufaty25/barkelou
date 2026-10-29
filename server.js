// Point d'entrée pour Hostinger (Node.js Web App) : « Entry file » = server.js
// Passe en mode production par défaut, puis démarre l'API et l'application.
process.env.NODE_ENV ||= 'production'
await import('./server/index.js')
