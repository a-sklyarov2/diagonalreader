-- Cleanup: drop RevenueCat-era tables superseded by the Stripe model.
-- `users` / `grants` have had zero readers/writers since the
-- single-unlimited-subscription cutover (subscriptions + usage hold
-- all live state). Safe to drop even if they still hold stale rows.
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS grants;
