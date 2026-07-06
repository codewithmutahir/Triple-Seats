-- Async quote send: track in-flight and failed email jobs
ALTER TYPE "QuoteStatus" ADD VALUE IF NOT EXISTS 'sending';
ALTER TYPE "QuoteStatus" ADD VALUE IF NOT EXISTS 'send_failed';
