# WeatherNow (React + Vite, JavaScript)

WeatherNow is a lightweight weather app that lets you search any city and view its current conditions using the Open‑Meteo APIs. No API keys required.

Live deploy options: CodeSandbox or StackBlitz.

## Tech
- React (JavaScript) + Vite
- Open‑Meteo Geocoding API and Forecast API

## Run locally
```bash
npm install
npm run dev
```

## Build
```bash
npm run build
npm run preview
```

## Features
- City search with suggestions (Open‑Meteo Geocoding)
- Current conditions: temperature, feels like, humidity, wind, description
- Loading and error states
- Responsive, clean UI

## Notes for Aganitha submission
- Candidate ID: Naukri1025
- Level 1: This README links to the AI chat session in your submission form.
- Level 2: Deploy to CodeSandbox/StackBlitz by importing this folder.
- Level 3: Clear code structure and minimal comments.

## APIs
- Geocoding: `https://geocoding-api.open-meteo.com/v1/search?name=...`
- Weather: `https://api.open-meteo.com/v1/forecast?latitude=..&longitude=..&current=...`

## Acknowledgements
- Open‑Meteo for free weather data
- Design ethos inspired by Aganitha’s focus on clarity and deep‑tech utility ([website](https://www.aganitha.ai/))
