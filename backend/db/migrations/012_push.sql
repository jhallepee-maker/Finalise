-- Migration 012 : abonnements aux notifications push (web push ; jetons natifs plus tard). 100 % additif.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pro_id     UUID NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  endpoint   TEXT NOT NULL UNIQUE,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  user_agent VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS push_subscriptions_pro ON push_subscriptions(pro_id);
