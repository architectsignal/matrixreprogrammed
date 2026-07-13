-- Preserve consecutive failed-payment counts when PayPal still reports the
-- subscription snapshot itself as ACTIVE during a PAYMENT.FAILED webhook.
-- Apply after phase6_paypal_subscriptions.sql.

DROP TRIGGER IF EXISTS paypal_preserve_failure_count_on_failed_snapshot;
CREATE TRIGGER paypal_preserve_failure_count_on_failed_snapshot
AFTER UPDATE OF payment_failure_count,last_event_type ON paypal_subscription_state
WHEN NEW.last_event_type = 'BILLING.SUBSCRIPTION.PAYMENT.FAILED'
  AND NEW.payment_failure_count < OLD.payment_failure_count
BEGIN
  UPDATE paypal_subscription_state
  SET payment_failure_count = OLD.payment_failure_count
  WHERE subscription_id = NEW.subscription_id;
END;
