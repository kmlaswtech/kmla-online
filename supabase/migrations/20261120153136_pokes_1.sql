SET local check_function_bodies = off;

CREATE TABLE "private"."poke_pairs" (
  "low_profile_id"        bigint                   NOT NULL,
  "high_profile_id"       bigint                   NOT NULL,
  "last_poker_profile_id" bigint                   NOT NULL,
  "last_poked_at"         timestamp with time zone NOT NULL DEFAULT now(),
  "last_strong"           boolean                  NOT NULL DEFAULT false,
  "poke_count"            integer                  NOT NULL DEFAULT 1,
  "strong_count"          integer                  NOT NULL DEFAULT 0,
  "strong_effect_pending" boolean                  NOT NULL DEFAULT false,
  CONSTRAINT "poke_pairs_counts" CHECK (((poke_count >= 1) AND (strong_count >= 0) AND (strong_count <= poke_count))),
  CONSTRAINT "poke_pairs_last_poker" CHECK (((last_poker_profile_id = low_profile_id) OR (last_poker_profile_id = high_profile_id))),
  CONSTRAINT "poke_pairs_ordered" CHECK ((low_profile_id < high_profile_id)),
  CONSTRAINT "poke_pairs_pkey" PRIMARY KEY (low_profile_id, high_profile_id),
  CONSTRAINT "poke_pairs_strong_effect" CHECK (((NOT strong_effect_pending) OR last_strong))
);

ALTER TABLE "private"."poke_pairs"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."notification_preferences"
  ADD COLUMN "poke_push_enabled" boolean NOT NULL DEFAULT true;

ALTER TYPE "public"."notification_category" ADD VALUE 'poke' AFTER 'moderation';

