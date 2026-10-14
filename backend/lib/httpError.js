// Erreur métier avec code HTTP : les services la lèvent, les routes la traduisent en réponse JSON.
class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

// Enveloppe un handler async : HttpError → réponse propre, autre erreur → 500 loggé.
const handle = fn => async (req, res) => {
  try {
    await fn(req, res);
  } catch (e) {
    if (e instanceof HttpError) return res.status(e.status).json({ error: e.message, ...e.extra });
    console.error('[route]', req.method, req.originalUrl, e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

module.exports = { HttpError, handle };
