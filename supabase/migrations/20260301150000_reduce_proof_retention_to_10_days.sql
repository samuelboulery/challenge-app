-- ============================================================
-- Reduce proof media retention from 30 to 10 days
-- ============================================================

CREATE OR REPLACE FUNCTION cleanup_old_proofs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_proof RECORD;
  v_path  TEXT;
BEGIN
  FOR v_proof IN
    SELECT id, media_url
      FROM proofs
      WHERE media_url IS NOT NULL
        AND created_at < now() - INTERVAL '10 days'
  LOOP
    v_path := substring(v_proof.media_url from '/object/public/proofs/(.+)$');

    IF v_path IS NOT NULL THEN
      DELETE FROM storage.objects
        WHERE bucket_id = 'proofs'
          AND name = v_path;
    END IF;

    UPDATE proofs SET media_url = NULL WHERE id = v_proof.id;
  END LOOP;
END;
$$;
