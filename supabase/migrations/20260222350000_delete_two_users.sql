-- One-shot data operation: delete two specific users from auth.users.
-- profiles and dependent data are removed via ON DELETE CASCADE.
DELETE FROM auth.users
WHERE id IN (
  'cadb1f27-5f18-4fc8-978c-82a754c54aef'::UUID,
  '101ccced-a78b-455b-860d-2c08da722153'::UUID
);
