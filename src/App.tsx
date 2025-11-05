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
  const [usernameCache, setUsernameCache] = useState<{[key: string]: string}>({})

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

  const fetchUsername = async (fid: string) => {
    // Check cache first
    if (usernameCache[fid]) {
      return usernameCache[fid]
    }

    try {
      const response = await fetch(`https://api.neynar.com/v2/farcaster/user/bulk?fids=${fid}`, {
        headers: {
          'accept': 'application/json',
          'api_key': 'NEYNAR_API_DOCS'
        }
      })
      const data = await response.json()

      if (data.users && data.users.length > 0) {
        const username = data.users[0].username
        setUsernameCache(prev => ({ ...prev, [fid]: username }))
        return username
      }
    } catch (error) {
      console.error('Error fetching username:', error)
    }

    return `fid:${fid}`
  }

  const loadLeaderboard = async () => {
    // Get all predictions with actual results
    const { data, error } = await supabase
      .from('predictions')
      .select('*')
      .not('difference', 'is', null)

    if (error || !data) {
      console.error('Error loading leaderboard:', error)
      return
    }

    // Group by user and count accurate predictions (difference <= 0.5°C)
    const userStats = data.reduce((acc: any, entry: any) => {
      const userId = entry.user_id
      if (!acc[userId]) {
        acc[userId] = {
          user_id: userId,
          username: '',
          accurate_count: 0,
          total_attempts: 0,
          best_difference: entry.difference
        }
      }

      acc[userId].total_attempts++
      if (entry.difference <= 0.5) {
        acc[userId].accurate_count++
      }
      if (entry.difference < acc[userId].best_difference) {
        acc[userId].best_difference = entry.difference
      }

      return acc
    }, {})

    // Convert to array and sort by accurate count, then by best difference
    const sortedLeaderboard = Object.values(userStats)
      .sort((a: any, b: any) => {
        if (b.accurate_count !== a.accurate_count) {
          return b.accurate_count - a.accurate_count
        }
        return a.best_difference - b.best_difference
      })
      .slice(0, 10)

    // Fetch usernames for all FIDs
    const leaderboardWithUsernames = await Promise.all(
      sortedLeaderboard.map(async (entry: any) => ({
        ...entry,
        username: await fetchUsername(entry.user_id)
      }))
    )

    setLeaderboard(leaderboardWithUsernames)
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
        <p className="update-info">⏱️ 1시간마다 물온도 업데이트</p>
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
            <p>🌊 실시간 한강 수온을 맞춰보세요!</p>
            <p>⏱️ 한강 수온은 1시간마다 업데이트됩니다</p>
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
              {leaderboard.map((entry: any, index: number) => (
                <div key={entry.user_id} className="leaderboard-item">
                  <span className="rank">#{index + 1}</span>
                  <div className="leader-info">
                    <span className="user-id">@{entry.username}</span>
                    <span className="prediction">{entry.accurate_count}회 맞춤 (총 {entry.total_attempts}회)</span>
                  </div>
                  <span className="diff">최고 ±{entry.best_difference.toFixed(1)}°C</span>
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
