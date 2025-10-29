const FORECAST_ENDPOINT = "https://api.open-meteo.com/v1/forecast";

export async function getCurrentWeather({ latitude, longitude, timezone, unit = "celsius" }) {
	if (typeof latitude !== "number" || typeof longitude !== "number") {
		throw new Error("Latitude and longitude are required numbers");
	}

	const params = new URLSearchParams({
		latitude: String(latitude),
		longitude: String(longitude),
		current: [
			"temperature_2m",
			"apparent_temperature",
			"is_day",
			"precipitation",
			"wind_speed_10m",
			"wind_direction_10m",
			"relative_humidity_2m",
			"weather_code"
		].join(","),
		hourly: ["temperature_2m"].join(","),
		timezone: timezone || "auto",
		temperature_unit: unit === "fahrenheit" ? "fahrenheit" : "celsius",
		wind_speed_unit: "kmh"
	});

	const url = `${FORECAST_ENDPOINT}?${params.toString()}`;
	const res = await fetch(url);
	if (!res.ok) {
		throw new Error(`Weather request failed (${res.status})`);
	}
	return await res.json();
}

export function describeWeatherCode(code) {
	// Mapping from Open-Meteo weather codes to human descriptions
	const map = {
		0: "Clear sky",
		1: "Mainly clear",
		2: "Partly cloudy",
		3: "Overcast",
		45: "Fog",
		48: "Depositing rime fog",
		51: "Light drizzle",
		53: "Moderate drizzle",
		55: "Dense drizzle",
		56: "Light freezing drizzle",
		57: "Dense freezing drizzle",
		61: "Slight rain",
		63: "Moderate rain",
		65: "Heavy rain",
		66: "Light freezing rain",
		67: "Heavy freezing rain",
		71: "Slight snow fall",
		73: "Moderate snow fall",
		75: "Heavy snow fall",
		77: "Snow grains",
		80: "Slight rain showers",
		81: "Moderate rain showers",
		82: "Violent rain showers",
		85: "Slight snow showers",
		86: "Heavy snow showers",
		95: "Thunderstorm",
		96: "Thunderstorm with slight hail",
		99: "Thunderstorm with heavy hail"
	};
	return map[code] || "Unknown conditions";
}


