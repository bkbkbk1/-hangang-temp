import { sdk } from '@farcaster/frame-sdk'
import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import './App.css'

function App() {
  const [prediction, setPrediction] = useState(15)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [nextDrawTime, setNextDrawTime] = useState('')
  const [userId, setUserId] = useState<string>('')
  const [leaderboard, setLeaderboard] = useState<any[]>([])
  const [showLeaderboard, setShowLeaderboard] = useState(false)

  useEffect(() => {
    const init = async () => {
      try {
        await sdk.actions.ready()
        updateNextDrawTime()

        // Get user ID from Farcaster SDK
        const context = await sdk.context
        const fid = context?.user?.fid?.toString() || `anon-${Math.random().toString(36).slice(2, 9)}`
        setUserId(fid)
        console.log('User ID:', fid)
      } catch (error) {
        console.error('SDK Error:', error)
        setUserId(`anon-${Math.random().toString(36).slice(2, 9)}`)
      }

      // Load leaderboard
      loadLeaderboard()
    }

    init()
  }, [])

  const loadLeaderboard = async () => {
    const { data, error } = await supabase
      .from('predictions')
      .select('*')
      .not('difference', 'is', null)
      .order('difference', { ascending: true })
      .order('created_at', { ascending: true }) // 선착순: 같은 오차면 먼저 제출한 사람이 이김
      .limit(10)

    if (!error && data) {
      setLeaderboard(data)
    }
  }

  const updateNextDrawTime = () => {
    const now = new Date()
    const hour = now.getHours()

    let nextDraw = new Date(now)
    if (hour < 12) {
      nextDraw.setHours(12, 0, 0, 0)
      setNextDrawTime('오늘 12:00')
    } else if (hour < 18) {
      nextDraw.setHours(18, 0, 0, 0)
      setNextDrawTime('오늘 18:00')
    } else {
      nextDraw.setDate(nextDraw.getDate() + 1)
      nextDraw.setHours(12, 0, 0, 0)
      setNextDrawTime('내일 12:00')
    }
  }


  const getNextDrawTime = () => {
    const now = new Date()
    const hour = now.getHours()

    let nextDraw = new Date(now)
    if (hour < 12) {
      nextDraw.setHours(12, 0, 0, 0)
    } else if (hour < 18) {
      nextDraw.setHours(18, 0, 0, 0)
    } else {
      nextDraw.setDate(nextDraw.getDate() + 1)
      nextDraw.setHours(12, 0, 0, 0)
    }

    return nextDraw.toISOString()
  }

  const handleSubmit = async () => {
    setLoading(true)

    try {
      // Save prediction to database (without actual_temp and difference)
      const { data: savedData, error } = await supabase
        .from('predictions')
        .insert([
          {
            user_id: userId || 'anonymous',
            prediction_temp: prediction,
            draw_time: getNextDrawTime()
          }
        ])
        .select()

      if (error) {
        console.error('Error saving prediction:', error)
        alert('예측 저장 실패: ' + error.message)
        setLoading(false)
        return
      }

      console.log('Prediction saved:', savedData)
      setIsSubmitted(true)
    } catch (error) {
      console.error('Error:', error)
      alert('오류가 발생했습니다')
    }

    setLoading(false)
  }

  return (
    <div className="app">
      <header>
        <h1>🌊 한강 몇도?</h1>
        <p>오늘의 한강 수온을 맞춰보세요!</p>
      </header>

      {!isSubmitted ? (
        <div className="prediction-section">
          <div className="temp-display">
            <span className="temp-value">{prediction}°C</span>
          </div>

          <input
            type="range"
            min="0"
            max="40"
            step="0.1"
            value={prediction}
            onChange={(e) => setPrediction(Number(e.target.value))}
            className="temp-slider"
          />

          <div className="range-labels">
            <span>0°C</span>
            <span>20°C</span>
            <span>40°C</span>
          </div>

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="submit-button"
          >
            {loading ? '확인 중...' : '예측 제출하기'}
          </button>

          <div className="info-box">
            <p>💰 참여비: 10원부터 (~$0.007 USDC)</p>
            <p>🏆 상금 풀: Coming Soon</p>
            <p>⏰ 다음 결과 발표: {nextDrawTime}</p>
          </div>
        </div>
      ) : (
        <div className="result-section">
          <h2>✅ 예측 제출 완료!</h2>
          <div className="result-box">
            <div className="result-item">
              <span className="label">내 예측:</span>
              <span className="value">{prediction}°C</span>
            </div>
            <div className="result-item highlight">
              <span className="label">결과 발표:</span>
              <span className="value">{nextDrawTime}</span>
            </div>
          </div>

          <div className="info-message">
            <p>🎯 {nextDrawTime}에 결과가 발표됩니다!</p>
            <p>리더보드에서 순위를 확인하세요</p>
          </div>

          <button
            onClick={() => {
              setIsSubmitted(false)
              setPrediction(15)
            }}
            className="retry-button"
          >
            새로운 예측 하기
          </button>
        </div>
      )}

      <div className="leaderboard-toggle">
        <button
          onClick={() => setShowLeaderboard(!showLeaderboard)}
          className="toggle-button"
        >
          {showLeaderboard ? '게임으로 돌아가기' : '🏆 리더보드 보기'}
        </button>
      </div>

      {showLeaderboard && (
        <div className="leaderboard-section">
          <h2>🏆 TOP 10 리더보드</h2>
          {leaderboard.length === 0 ? (
            <p className="no-data">아직 완료된 예측이 없습니다</p>
          ) : (
            <div className="leaderboard-list">
              {leaderboard.map((entry, index) => (
                <div key={entry.id} className="leaderboard-item">
                  <span className="rank">#{index + 1}</span>
                  <div className="leader-info">
                    <span className="user-id">User {entry.user_id.slice(0, 8)}</span>
                    <span className="prediction">{entry.prediction_temp}°C 예측</span>
                  </div>
                  <span className="diff">±{entry.difference}°C</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <footer>
        <p className="footer-text">
          매일 12시, 18시 결과 발표 | 가장 근접한 예측자에게 상금 분배
        </p>
      </footer>
    </div>
  )
}

export default App
