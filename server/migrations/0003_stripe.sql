-- Stripe customer link for the single monthly subscription.
-- subscriptions(product_id) stores the Stripe price id, expires_at the
-- subscription current_period_end in milliseconds.
CREATE TABLE IF NOT EXISTS stripe_customers (
  user_id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL UNIQUE
);
