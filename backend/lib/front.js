// Adresse principale du site (première origine de FRONTEND_URL, qui peut en lister plusieurs pour le CORS).
module.exports = () => (process.env.FRONTEND_URL || '').split(',')[0].trim().replace(/\/$/, '');
