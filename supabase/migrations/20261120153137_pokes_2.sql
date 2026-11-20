SET local check_function_bodies = off;

ALTER TYPE "public"."notification_kind" ADD VALUE 'poked' AFTER 'comment_mentioned';

