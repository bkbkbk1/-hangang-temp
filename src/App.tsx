import { sdk } from '@farcaster/frame-sdk'
import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import './App.css'

function App() {
  const [prediction, setPrediction] = useState(15)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [userId, setUserId] = useState<string>('')
  const [leaderboard, setLeaderboard] = useState<any[]>([])
  const [showLeaderboard, setShowLeaderboard] = useState(false)
  const [actualTemp, setActualTemp] = useState<number | null>(null)
  const [difference, setDifference] = useState<number | null>(null)

  useEffect(() => {
    const init = async () => {
      try {
        await sdk.actions.ready()

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

  const fetchActualTemperature = async () => {
    try {
      const response = await fetch('https://api.hangang.life')
      const data = await response.json()

      // Calculate average temperature from all stations
      const temps = Object.values(data.DATAs.DATA.HANGANG).map(
        (station: any) => station.TEMP
      )
      const avgTemp = temps.reduce((a: number, b: number) => a + b, 0) / temps.length
      const roundedTemp = Math.round(avgTemp * 10) / 10

      return roundedTemp
    } catch (error) {
      console.error('Error fetching temperature:', error)
      return null
    }
  }

  const handleSubmit = async () => {
    setLoading(true)

    try {
      // Fetch actual temperature
      const currentTemp = await fetchActualTemperature()

      if (currentTemp === null) {
        alert('온도를 가져오는데 실패했습니다. 다시 시도해주세요.')
        setLoading(false)
        return
      }

      setActualTemp(currentTemp)
      const diff = Math.abs(prediction - currentTemp)
      setDifference(diff)

      // Save prediction to database with result
      const { error } = await supabase
        .from('predictions')
        .insert([
          {
            user_id: userId || 'anonymous',
            prediction_temp: prediction,
            actual_temp: currentTemp,
            difference: diff,
            draw_time: new Date().toISOString()
          }
        ])

      if (error) {
        console.error('Error saving prediction:', error)
      }

      setIsSubmitted(true)
      loadLeaderboard() // Refresh leaderboard
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
            {loading ? '확인 중...' : '정답 확인하기'}
          </button>

          <div className="info-box">
            <p>🌊 현재 한강 수온을 맞춰보세요!</p>
            <p>🎯 슬라이더를 움직여 온도를 선택하세요</p>
          </div>
        </div>
      ) : (
        <div className="result-section">
          <h2>🎯 결과 발표!</h2>
          <div className="result-box">
            <div className="result-item">
              <span className="label">내 예측:</span>
              <span className="value">{prediction}°C</span>
            </div>
            <div className="result-item highlight">
              <span className="label">실제 온도:</span>
              <span className="value">{actualTemp}°C</span>
            </div>
            <div className="result-item">
              <span className="label">오차:</span>
              <span className="value">±{difference?.toFixed(1)}°C</span>
            </div>
          </div>

          <div className="info-message">
            {difference !== null && difference < 0.5 && (
              <p>🎉 완벽합니다! 거의 정확하게 맞추셨어요!</p>
            )}
            {difference !== null && difference >= 0.5 && difference < 2 && (
              <p>👍 훌륭합니다! 매우 근접했어요!</p>
            )}
            {difference !== null && difference >= 2 && (
              <p>💪 다시 도전해보세요!</p>
            )}
          </div>

          <button
            onClick={() => {
              setIsSubmitted(false)
              setPrediction(15)
              setActualTemp(null)
              setDifference(null)
            }}
            className="retry-button"
          >
            다시 맞추기
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
          실시간 한강 수온 퀴즈 | 오차가 적을수록 순위가 올라갑니다
        </p>
      </footer>
    </div>
  )
}

export default App
