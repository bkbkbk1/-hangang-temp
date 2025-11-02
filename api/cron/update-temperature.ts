import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || ''
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // Verify this is a cron request (security)
  const authHeader = req.headers.authorization
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    // 1. Fetch current Han River temperature
    const apiResponse = await fetch('https://api.hangang.life')
    const data = await apiResponse.json()

    // Calculate average temperature from all stations
    const temps = Object.values(data.DATAs.DATA.HANGANG).map(
      (station: any) => station.TEMP
    )
    const avgTemp = temps.reduce((a: number, b: number) => a + b, 0) / temps.length
    const actualTemp = Math.round(avgTemp * 10) / 10

    // 2. Get current time for draw_time matching
    const now = new Date()
    const hour = now.getUTCHours() + 9 // Convert to KST (UTC+9)

    // Determine which draw time this is for (12:00 or 18:00 KST)
    let drawHour: number
    if (hour >= 11 && hour < 17) {
      drawHour = 12
    } else {
      drawHour = 18
    }

    const drawTime = new Date(now)
    drawTime.setUTCHours(drawHour - 9, 0, 0, 0) // Set to draw time in UTC

    // 3. Connect to Supabase
    const supabase = createClient(supabaseUrl, supabaseKey)

    // 4. Get all predictions for this draw time that haven't been processed
    const { data: predictions, error: fetchError } = await supabase
      .from('predictions')
      .select('*')
      .is('actual_temp', null)
      .gte('draw_time', new Date(drawTime.getTime() - 6 * 60 * 60 * 1000).toISOString())
      .lte('draw_time', drawTime.toISOString())

    if (fetchError) {
      throw fetchError
    }

    if (!predictions || predictions.length === 0) {
      return res.status(200).json({
        message: 'No predictions to update',
        actualTemp,
        drawTime: drawTime.toISOString()
      })
    }

    // 5. Update all predictions with actual temperature and difference
    const updates = predictions.map(prediction => ({
      id: prediction.id,
      actual_temp: actualTemp,
      difference: Math.abs(prediction.prediction_temp - actualTemp)
    }))

    for (const update of updates) {
      await supabase
        .from('predictions')
        .update({
          actual_temp: update.actual_temp,
          difference: update.difference
        })
        .eq('id', update.id)
    }

    return res.status(200).json({
      message: 'Temperature updated successfully',
      actualTemp,
      drawTime: drawTime.toISOString(),
      updatedCount: predictions.length
    })

  } catch (error) {
    console.error('Error updating temperature:', error)
    return res.status(500).json({
      error: 'Failed to update temperature',
      details: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}
