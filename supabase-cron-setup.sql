-- 1. pg_cron extension 활성화 (Supabase에서는 이미 활성화되어 있음)
-- CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. 한강 수온 업데이트 함수 생성
CREATE OR REPLACE FUNCTION update_hangang_temperature()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_temp FLOAT8;
  draw_timestamp TIMESTAMPTZ;
BEGIN
  -- 현재 시간 (KST 기준으로 12시 또는 18시)
  draw_timestamp := NOW();

  -- 한강 API에서 수온 가져오기는 외부 HTTP 호출이므로
  -- 여기서는 임시로 랜덤 값 사용 (실제로는 Edge Function 필요)
  -- TODO: Edge Function으로 API 호출 후 이 함수 호출

  -- 현재는 16.0 ~ 18.0 사이 임시 값
  current_temp := 16.0 + (random() * 2.0);

  -- 해당 draw_time의 예측들 업데이트
  UPDATE predictions
  SET
    actual_temp = current_temp,
    difference = ABS(prediction_temp - current_temp)
  WHERE
    actual_temp IS NULL
    AND draw_time <= draw_timestamp
    AND draw_time > draw_timestamp - INTERVAL '6 hours';

  RAISE NOTICE 'Updated predictions with temp: %', current_temp;
END;
$$;

-- 3. Cron Job 스케줄 설정 (매일 12시, 18시 KST)
-- KST는 UTC+9이므로 UTC 기준으로 03시, 09시
SELECT cron.schedule(
  'update-hangang-noon',  -- job name
  '0 3 * * *',            -- 매일 UTC 03:00 (KST 12:00)
  'SELECT update_hangang_temperature();'
);

SELECT cron.schedule(
  'update-hangang-evening',  -- job name
  '0 9 * * *',               -- 매일 UTC 09:00 (KST 18:00)
  'SELECT update_hangang_temperature();'
);

-- 4. 등록된 Cron Job 확인
SELECT * FROM cron.job;

-- 5. 수동 테스트
-- SELECT update_hangang_temperature();
