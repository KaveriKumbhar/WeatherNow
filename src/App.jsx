import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { searchCitiesByName, resolvePlaceFromCoords, resolveNearbyPlaces } from './api/geocoding'
import { getCurrentWeather, describeWeatherCode } from './api/weather'

function App() {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [loadingSuggest, setLoadingSuggest] = useState(false)
  const [selectedPlace, setSelectedPlace] = useState(null)
  const [weather, setWeather] = useState(null)
  const [loadingWeather, setLoadingWeather] = useState(false)
  const [error, setError] = useState('')
  const [unit, setUnit] = useState(() => localStorage.getItem('unit') || 'celsius')
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark')
  const [localTime, setLocalTime] = useState('')
  const [activeIndex, setActiveIndex] = useState(-1)
  const debounceRef = useRef(0)
  const inputRef = useRef(null)
  const [nearby, setNearby] = useState([])

  function parseDMSPart(part, isLat) {
    // supports 16°11'07.0"N or 74°27'43.8"E or plain numbers
    const dms = /^(\d{1,3})\D+(\d{1,2})\D+(\d{1,2}(?:\.\d+)?)\D*([NSEW])?$/i
    const m = String(part).trim().match(dms)
    if (!m) return null
    const deg = parseFloat(m[1])
    const min = parseFloat(m[2])
    const sec = parseFloat(m[3])
    const hemi = (m[4] || '').toUpperCase()
    let val = deg + min / 60 + sec / 3600
    if (hemi === 'S' || hemi === 'W') val = -val
    if (!hemi && isLat && deg > 90) return null
    if (!hemi && !isLat && deg > 180) return null
    return val
  }

  function parseLatLon(text) {
    const t = String(text).trim()
    // Decimal form: lat, lon
    const dec = /^\s*([+-]?\d{1,3}(?:\.\d+)?)\s*,\s*([+-]?\d{1,3}(?:\.\d+)?)\s*$/
    const md = t.match(dec)
    if (md) {
      const lat = parseFloat(md[1]); const lon = parseFloat(md[2])
      if (isFinite(lat) && isFinite(lon)) return { lat, lon }
    }
    // DMS two parts split by space
    const parts = t.split(/\s+/)
    if (parts.length === 2) {
      const lat = parseDMSPart(parts[0], true)
      const lon = parseDMSPart(parts[1], false)
      if (lat != null && lon != null) return { lat, lon }
    }
    return null
  }

  // Removed localStorage persistence - app now starts fresh every time

  // Theme toggle functionality
  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark'
    setTheme(newTheme)
    localStorage.setItem('theme', newTheme)
  }

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => {
    let active = true
    if (!query || query.length < 2) {
      setSuggestions([])
      return
    }
    setLoadingSuggest(true)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      searchCitiesByName(query, { count: 6 })
        .then((res) => {
          if (!active) return
          setSuggestions(res)
        })
        .catch(() => {
          if (!active) return
          setSuggestions([])
        })
        .finally(() => active && setLoadingSuggest(false))
    }, 300)
    return () => {
      active = false
      clearTimeout(debounceRef.current)
    }
  }, [query])

  useEffect(() => {
    if (!selectedPlace) return
    setLoadingWeather(true)
    setError('')
    getCurrentWeather({
      latitude: selectedPlace.latitude,
      longitude: selectedPlace.longitude,
      timezone: selectedPlace.timezone,
      unit
    })
      .then((data) => setWeather(data))
      .catch((e) => setError(e.message || 'Failed to load weather'))
      .finally(() => setLoadingWeather(false))
    // Removed localStorage persistence - no longer saving selected place
  }, [selectedPlace, unit])

  useEffect(() => {
    if (!selectedPlace) return
    const tz = selectedPlace.timezone || 'auto'
    const update = () => {
      try {
        const now = new Date().toLocaleString(undefined, { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false })
        setLocalTime(now)
      } catch {
        setLocalTime('')
      }
    }
    update()
    const id = setInterval(update, 60 * 1000)
    return () => clearInterval(id)
  }, [selectedPlace])

  const current = weather?.current
  const labelForPlace = (p) => [p?.name, p?.admin1, p?.country].filter(Boolean).join(', ')
  const placeLabel = useMemo(() => {
    if (!selectedPlace) return ''
    return labelForPlace(selectedPlace)
  }, [selectedPlace])
  const filteredNearby = useMemo(() => {
    const cur = labelForPlace(selectedPlace || {})
    return (nearby || []).filter((p) => labelForPlace(p) && labelForPlace(p) !== cur)
  }, [nearby, selectedPlace])

  const last24Temps = useMemo(() => {
    const temps = weather?.hourly?.temperature_2m || []
    if (!temps.length) return []
    return temps.slice(Math.max(0, temps.length - 24))
  }, [weather])

  function sparklinePath(values, width = 220, height = 56, pad = 6) {
    if (!values || values.length === 0) return ''
    const w = width - pad * 2
    const h = height - pad * 2
    const min = Math.min(...values)
    const max = Math.max(...values)
    const range = max - min || 1
    const stepX = values.length > 1 ? w / (values.length - 1) : 0
    const points = values.map((v, i) => {
      const x = pad + i * stepX
      const y = pad + h - ((v - min) / range) * h
      return `${i === 0 ? 'M' : 'L'}${x},${y}`
    })
    return points.join(' ')
  }

  return (
    <div className="app">
      <nav className="navbar">
        <div className="nav-brand">
          <div className="logo">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2L13.09 8.26L20 9L13.09 9.74L12 16L10.91 9.74L4 9L10.91 8.26L12 2Z" fill="currentColor"/>
              <path d="M19 15L19.5 17L22 17.5L19.5 18L19 20L18.5 18L16 17.5L18.5 17L19 15Z" fill="currentColor"/>
              <path d="M5 15L5.5 17L8 17.5L5.5 18L5 20L4.5 18L2 17.5L4.5 17L5 15Z" fill="currentColor"/>
            </svg>
          </div>
          <div className="brand">WeatherNow</div>
        </div>
        <div className="nav-actions">
          <button
            className="theme-toggle"
            onClick={toggleTheme}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 3V1M12 23V21M4.22 4.22L2.81 2.81M21.19 21.19L19.78 19.78M3 12H1M23 12H21M4.22 19.78L2.81 21.19M21.19 2.81L19.78 4.22M12 17C14.7614 17 17 14.7614 17 12C17 9.23858 14.7614 7 12 7C9.23858 7 7 9.23858 7 12C7 14.7614 9.23858 17 12 17Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </button>
          <button
            className={`unit ${unit === 'celsius' ? 'active' : ''}`}
            onClick={() => { setUnit('celsius'); localStorage.setItem('unit', 'celsius') }}
          >°C</button>
          <button
            className={`unit ${unit === 'fahrenheit' ? 'active' : ''}`}
            onClick={() => { setUnit('fahrenheit'); localStorage.setItem('unit', 'fahrenheit') }}
          >°F</button>
        </div>
      </nav>
      <header className="header">
        <p>Fast, keyless weather powered by Open‑Meteo</p>
      </header>
      <section className="search">
        <label htmlFor="city">Search city</label>
        <input
          id="city"
          placeholder="e.g., Hyderabad, London, San Francisco"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setActiveIndex(-1) }}
          autoComplete="off"
          ref={inputRef}
          onKeyDown={(e) => {
            if (!suggestions.length) return
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActiveIndex((i) => (i + 1) % suggestions.length)
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActiveIndex((i) => (i - 1 + suggestions.length) % suggestions.length)
            } else if (e.key === 'Enter') {
              const coords = parseLatLon(query)
              if (coords) {
                resolvePlaceFromCoords(coords.lat, coords.lon).then((p) => {
                  setSelectedPlace(p)
                  setQuery(labelForPlace(p) || p.name)
                  setSuggestions([])
                }).catch(() => {})
              } else if (activeIndex >= 0) {
                const s = suggestions[activeIndex]
                setSelectedPlace(s)
                setQuery(labelForPlace(s))
                setSuggestions([])
              }
            }
          }}
        />
        <div className="actions">
          <button className="ghost" onClick={() => {
            if (!navigator.geolocation) {
              setError('Geolocation not supported')
              return
            }
            navigator.geolocation.getCurrentPosition(
              async (pos) => {
                const coords = pos.coords
                try {
                  const r = await resolvePlaceFromCoords(coords.latitude, coords.longitude)
                  const p = r || { id: `${coords.latitude},${coords.longitude}`,
                    name: `${coords.latitude.toFixed(3)}, ${coords.longitude.toFixed(3)}`,
                    latitude: coords.latitude, longitude: coords.longitude, country: '', admin1: '', timezone: 'auto' }
                  setSelectedPlace(p)
                  setQuery(labelForPlace(p) || p.name)
                  setSuggestions([])
                  // fetch additional options
                  resolveNearbyPlaces(coords.latitude, coords.longitude).then(setNearby).catch(() => setNearby([]))
                } catch {
                  const p = { id: `${coords.latitude},${coords.longitude}`,
                    name: `${coords.latitude.toFixed(3)}, ${coords.longitude.toFixed(3)}`,
                    latitude: coords.latitude, longitude: coords.longitude, country: '', admin1: '', timezone: 'auto' }
                  setSelectedPlace(p)
                  setQuery(labelForPlace(p) || p.name)
                  setSuggestions([])
                  setNearby([])
                }
              },
              () => setError('Unable to get location')
            )
          }}>Use my location</button>
        </div>
        {loadingSuggest ? (
          <div className="hint">Searching...</div>
        ) : suggestions.length > 0 ? (
          <ul className="suggestions">
            {suggestions.map((s, idx) => (
              <li key={s.id}>
                <button
                  className={`suggestion ${idx === activeIndex ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedPlace(s)
                    setQuery(labelForPlace(s))
                    setSuggestions([])
                  }}
                >
                  <span>{s.name}</span>
                  <small>{[s.admin1, s.country].filter(Boolean).join(', ')}</small>
                </button>
              </li>
            ))}
          </ul>
        ) : query && query.length >= 2 ? (
          <div className="hint">No matches</div>
        ) : null}
      </section>

      <section className="results">
        {error ? <div className="error">{error}</div> : null}
        {loadingWeather ? <div className="loading">Loading weather...</div> : null}
        {current && !loadingWeather ? (
          <div className="card">
            <h2>{placeLabel}</h2>
            {selectedPlace ? (
              <div className="coords">{selectedPlace.latitude.toFixed(4)}, {selectedPlace.longitude.toFixed(4)}</div>
            ) : null}
            {filteredNearby && filteredNearby.length > 0 ? (
              <div className="nearby">
                {filteredNearby.length === 1 ? (
                  <button className="nearby-primary" onClick={() => { const p = filteredNearby[0]; setSelectedPlace(p); setQuery(labelForPlace(p)); setNearby([]) }}>
                    Set to: {labelForPlace(filteredNearby[0])}
                  </button>
                ) : (
                  <>
                    <div className="nearby-title">Did you mean:</div>
                    <div className="nearby-list">
                      {filteredNearby.slice(0, 5).map((p) => (
                        <button key={p.id} className="nearby-item" onClick={() => { setSelectedPlace(p); setQuery(labelForPlace(p)); setNearby([]) }}>
                          {labelForPlace(p)}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ) : null}
            {localTime ? <div className="local-time">Local time: {localTime}</div> : null}
            {last24Temps.length ? (
              <div className="sparkline">
                <div className="sparkline-header">
                  <span>Past 24h</span>
                  <span className="sparkline-range">
                    {Math.min(...last24Temps).toFixed(0)}°{unit === 'fahrenheit' ? 'F' : 'C'} – {Math.max(...last24Temps).toFixed(0)}°{unit === 'fahrenheit' ? 'F' : 'C'}
                  </span>
                </div>
                <svg width="100%" height="56" viewBox="0 0 220 56" preserveAspectRatio="none" aria-hidden="true">
                  <path d={sparklinePath(last24Temps)} fill="none" stroke="var(--accent)" strokeWidth="2" />
                </svg>
              </div>
            ) : null}
            <div className="metrics">
              <div className="metric">
                <span className="label">Temperature</span>
                <span className="value">{current.temperature_2m}°{unit === 'fahrenheit' ? 'F' : 'C'}</span>
              </div>
              <div className="metric">
                <span className="label">Feels like</span>
                <span className="value">{current.apparent_temperature}°{unit === 'fahrenheit' ? 'F' : 'C'}</span>
              </div>
              <div className="metric">
                <span className="label">Humidity</span>
                <span className="value">{current.relative_humidity_2m}%</span>
              </div>
              <div className="metric">
                <span className="label">Wind</span>
                <span className="value">{current.wind_speed_10m} km/h</span>
              </div>
            </div>
            <p className="desc">{describeWeatherCode(current.weather_code)}</p>
          </div>
        ) : (
          <div className="placeholder">Search a city to see current weather.</div>
        )}
      </section>
      <footer className="footer">
        <span>
          Data from Open‑Meteo Geocoding and Forecast APIs. Built for Aganitha.
        </span>
      </footer>
    </div>
  )
}

export default App
