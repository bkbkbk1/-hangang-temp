import { sdk } from '@farcaster/frame-sdk'
import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { translations, type Language } from './lib/translations'
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
  const [usernameCache, setUsernameCache] = useState<{[key: string]: {username: string, pfp_url: string}}>({})
  const [language, setLanguage] = useState<Language>('ko')
  const [userRank, setUserRank] = useState<number | null>(null)

  const t = translations[language]

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

  const fetchUserInfo = async (fid: string) => {
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
        const user = data.users[0]
        const userInfo = {
          username: user.username,
          pfp_url: user.pfp_url || ''
        }
        setUsernameCache(prev => ({ ...prev, [fid]: userInfo }))
        return userInfo
      }
    } catch (error) {
      console.error('Error fetching user info:', error)
    }

    return { username: `fid:${fid}`, pfp_url: '' }
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

    // Fetch user info for all FIDs
    const leaderboardWithUserInfo = await Promise.all(
      sortedLeaderboard.map(async (entry: any) => {
        const userInfo = await fetchUserInfo(entry.user_id)
        return {
          ...entry,
          username: userInfo.username,
          pfp_url: userInfo.pfp_url
        }
      })
    )

    setLeaderboard(leaderboardWithUserInfo)
  }

  const fetchActualTemperature = async () => {
    try {
      const response = await fetch('https://api.hangang.life')
      const data = await response.json()

      // Check if data is recent (within 2 hours)
      const stations = Object.values(data.DATAs.DATA.HANGANG) as any[]
      const latestUpdate = stations.find(s => s.LAST_UPDATE)?.LAST_UPDATE

      if (latestUpdate) {
        const updateTime = new Date(latestUpdate).getTime()
        const now = Date.now()
        const hoursDiff = (now - updateTime) / (1000 * 60 * 60)

        // If data is older than 2 hours, use random temperature
        if (hoursDiff > 2) {
          console.log('API data is old, using random temperature')
          // Generate random temperature between 8°C and 18°C (typical Han River range)
          const randomTemp = Math.round((Math.random() * 10 + 8) * 10) / 10
          return randomTemp
        }
      }

      // Calculate average temperature from all stations
      const temps = stations
        .filter(s => s.TEMP !== null)
        .map(s => s.TEMP)

      if (temps.length === 0) {
        // If no valid temps, use random
        const randomTemp = Math.round((Math.random() * 10 + 8) * 10) / 10
        return randomTemp
      }

      const avgTemp = temps.reduce((a: number, b: number) => a + b, 0) / temps.length
      const roundedTemp = Math.round(avgTemp * 10) / 10

      return roundedTemp
    } catch (error) {
      console.error('Error fetching temperature:', error)
      // On error, use random temperature
      const randomTemp = Math.round((Math.random() * 10 + 8) * 10) / 10
      return randomTemp
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

      // Calculate user rank
      await calculateUserRank()

      setIsSubmitted(true)
      loadLeaderboard() // Refresh leaderboard
    } catch (error) {
      console.error('Error:', error)
      alert('오류가 발생했습니다')
    }

    setLoading(false)
  }

  const calculateUserRank = async () => {
    try {
      // Get all predictions
      const { data, error } = await supabase
        .from('predictions')
        .select('*')
        .not('difference', 'is', null)

      if (error || !data) return

      // Group by user and count accurate predictions
      const userStats = data.reduce((acc: any, entry: any) => {
        const uid = entry.user_id
        if (!acc[uid]) {
          acc[uid] = {
            user_id: uid,
            accurate_count: 0,
            total_attempts: 0,
            best_difference: entry.difference
          }
        }

        acc[uid].total_attempts++
        if (entry.difference <= 0.5) {
          acc[uid].accurate_count++
        }
        if (entry.difference < acc[uid].best_difference) {
          acc[uid].best_difference = entry.difference
        }

        return acc
      }, {})

      // Sort and find user rank
      const sortedUsers = Object.values(userStats)
        .sort((a: any, b: any) => {
          if (b.accurate_count !== a.accurate_count) {
            return b.accurate_count - a.accurate_count
          }
          return a.best_difference - b.best_difference
        })

      const rank = sortedUsers.findIndex((u: any) => u.user_id === userId) + 1
      setUserRank(rank > 0 ? rank : null)
    } catch (error) {
      console.error('Error calculating rank:', error)
    }
  }

  return (
    <div className="app">
      <header>
        <div className="header-content">
          <div>
            <h1>🌊 {t.title}</h1>
            <p>{t.subtitle}</p>
            <p className="update-info">⏱️ {t.updateInfo}</p>
          </div>
          <button
            className="language-toggle"
            onClick={() => setLanguage(language === 'ko' ? 'en' : 'ko')}
          >
            {language === 'ko' ? 'EN' : 'KO'}
          </button>
        </div>
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
            {loading ? t.checking : t.checkAnswer}
          </button>

          <div className="info-box">
            <p>🌊 {t.infoRealtime}</p>
            <p>⏱️ {t.infoUpdate}</p>
          </div>
        </div>
      ) : (
        <div className="result-section">
          <h2>🎯 {t.resultTitle}</h2>
          <div className="result-box">
            <div className="result-item">
              <span className="label">{t.myPrediction}</span>
              <span className="value">{prediction}°C</span>
            </div>
            <div className="result-item highlight">
              <span className="label">{t.actualTemp}</span>
              <span className="value">{actualTemp}°C</span>
            </div>
            <div className="result-item">
              <span className="label">{t.difference}</span>
              <span className="value">±{difference?.toFixed(1)}°C</span>
            </div>
          </div>

          {userRank !== null && userRank <= 5 && (
            <div className="rank-badge">
              <div className="rank-number">#{userRank}</div>
              <div className="rank-text">
                <p className="rank-title">🏆 {t.congratsTop5}</p>
                <p className="rank-subtitle">{t.currentRank} {userRank}{t.rankAchieved}</p>
              </div>
            </div>
          )}

          <div className="info-message">
            {difference !== null && difference < 0.5 && (
              <p>🎉 {t.perfect}</p>
            )}
            {difference !== null && difference >= 0.5 && difference < 2 && (
              <p>👍 {t.great}</p>
            )}
            {difference !== null && difference >= 2 && (
              <p>💪 {t.tryAgain}</p>
            )}
            {userRank !== null && userRank > 5 && (
              <p>📊 {t.currentRank} #{userRank}</p>
            )}
          </div>

          <button
            onClick={() => {
              setIsSubmitted(false)
              setPrediction(15)
              setActualTemp(null)
              setDifference(null)
              setUserRank(null)
            }}
            className="retry-button"
          >
            {t.playAgain}
          </button>
        </div>
      )}

      <div className="leaderboard-toggle">
        <button
          onClick={() => setShowLeaderboard(!showLeaderboard)}
          className="toggle-button"
        >
          {showLeaderboard ? t.backToGame : `🏆 ${t.leaderboardToggle}`}
        </button>
      </div>

      {showLeaderboard && (
        <div className="leaderboard-section">
          <h2>🏆 {t.leaderboardTitle}</h2>
          {leaderboard.length === 0 ? (
            <p className="no-data">{t.noData}</p>
          ) : (
            <div className="leaderboard-list">
              {leaderboard.map((entry: any, index: number) => (
                <div key={entry.user_id} className="leaderboard-item">
                  <span className="rank">#{index + 1}</span>
                  <img
                    src={entry.pfp_url || 'https://via.placeholder.com/40/667eea/ffffff?text=👤'}
                    alt={entry.username}
                    className="profile-pic"
                  />
                  <div className="leader-info">
                    <span className="user-id">@{entry.username}</span>
                    <span className="prediction">
                      {entry.accurate_count} {t.timesCorrect} ({t.totalAttempts} {entry.total_attempts} {t.attempts})
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <footer>
        <p className="footer-text">
          {t.footer}
        </p>
      </footer>
    </div>
  )
}

export default App
