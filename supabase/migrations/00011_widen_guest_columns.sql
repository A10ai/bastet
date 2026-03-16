-- Widen guest columns to accept full names, not just ISO codes
ALTER TABLE guests ALTER COLUMN nationality TYPE varchar(60);
ALTER TABLE guests ALTER COLUMN country TYPE varchar(60);
ALTER TABLE guests ALTER COLUMN language TYPE varchar(20);
