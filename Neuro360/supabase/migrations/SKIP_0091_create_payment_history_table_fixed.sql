-- Fixed: Create enhanced payment_history table for Razorpay transactions
-- This script properly handles existing tables

-- Drop existing table if it exists (this will remove old structure)
DROP TABLE IF EXISTS payment_history CASCADE;

-- Create fresh payment_history table with complete structure
CREATE TABLE payment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id VARCHAR(255) NOT NULL UNIQUE,
  order_id VARCHAR(255),
  signature VARCHAR(512),
  clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'INR',
  status VARCHAR(50) NOT NULL,
  package_id VARCHAR(100),
  package_name VARCHAR(255),
  reports INTEGER DEFAULT 0,
  plan_details JSONB DEFAULT '{}',
  subscription JSONB DEFAULT '{}',
  payment_details JSONB DEFAULT '{}',
  provider VARCHAR(50) DEFAULT 'razorpay',
  ip_address VARCHAR(45),
  user_agent TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX idx_payment_history_payment_id ON payment_history(payment_id);
CREATE INDEX idx_payment_history_clinic_id ON payment_history(clinic_id);
CREATE INDEX idx_payment_history_status ON payment_history(status);
CREATE INDEX idx_payment_history_created_at ON payment_history(created_at DESC);
CREATE INDEX idx_payment_history_package_id ON payment_history(package_id);

-- Add updated_at trigger
CREATE TRIGGER update_payment_history_updated_at
  BEFORE UPDATE ON payment_history
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE payment_history ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Allow all operations (refine later for production)
DROP POLICY IF EXISTS "Allow all operations on payment_history" ON payment_history;
CREATE POLICY "Allow all operations on payment_history"
  ON payment_history FOR ALL USING (true);

-- Add comments for documentation
COMMENT ON TABLE payment_history IS 'Stores complete Razorpay payment transaction history';
COMMENT ON COLUMN payment_history.payment_id IS 'Razorpay payment ID starting with pay_';
COMMENT ON COLUMN payment_history.plan_details IS 'JSON object containing plan info: {id, name, description, reportsIncluded, savings, features}';
COMMENT ON COLUMN payment_history.subscription IS 'JSON object containing subscription info: {purchaseDate, expiryDate, validityPeriod, isActive, reportsUsed, reportsRemaining}';
COMMENT ON COLUMN payment_history.payment_details IS 'JSON object containing payment method info: {gateway, method, environment, verified, transactionFee}';
