CREATE EXTENSION IF NOT EXISTS timescaledb;

DROP TABLE IF EXISTS transactions, accounts, bills, loans, bnpl, credit_limits,
  blocked_merchants, rules, budgets, alerts, traces CASCADE;

CREATE TABLE accounts (
  key text PRIMARY KEY,            -- checking | savings | card
  nessie_id text,
  type text NOT NULL,
  opening_balance numeric(12,2) NOT NULL  -- ledger balance = opening + sum(transactions)
);

CREATE TABLE transactions (
  id text NOT NULL,
  account text NOT NULL,
  ts timestamptz NOT NULL,
  amount numeric(12,2) NOT NULL,   -- signed: + money in, - money out (card: - = more owed)
  kind text NOT NULL,              -- purchase | deposit | bill | transfer
  category text,
  merchant text,
  description text,
  source text NOT NULL,            -- nessie | local
  PRIMARY KEY (id, ts)
);
SELECT create_hypertable('transactions', 'ts');

CREATE TABLE bills (
  id text PRIMARY KEY, account text, payee text, amount numeric(12,2), day int,
  next_date date, status text, trial boolean DEFAULT false, used boolean DEFAULT true
);
CREATE TABLE loans (
  id text PRIMARY KEY, type text, amount numeric(12,2), monthly_payment numeric(12,2),
  apr numeric(5,2), description text
);
CREATE TABLE bnpl (
  merchant text, item text, n int, of_n int, amount numeric(12,2), due date, paid boolean,
  PRIMARY KEY (merchant, item, n)
);
CREATE TABLE credit_limits (account text PRIMARY KEY, credit_limit numeric(12,2));
CREATE TABLE blocked_merchants (merchant text PRIMARY KEY, created_at timestamptz DEFAULT now());
CREATE TABLE rules (id serial PRIMARY KEY, rule jsonb NOT NULL, created_at timestamptz DEFAULT now());
CREATE TABLE budgets (category text PRIMARY KEY, monthly numeric(12,2), fixed boolean);
CREATE TABLE alerts (id serial PRIMARY KEY, kind text, payload jsonb, created_at timestamptz DEFAULT now(),
  dismissed boolean DEFAULT false);
CREATE TABLE traces (id serial PRIMARY KEY, payload jsonb, created_at timestamptz DEFAULT now());
