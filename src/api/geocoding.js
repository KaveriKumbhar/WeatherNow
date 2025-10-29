const GEOCODING_ENDPOINT = "https://geocoding-api.open-meteo.com/v1/search";
const REVERSE_ENDPOINT = "https://geocoding-api.open-meteo.com/v1/reverse";
const NOMINATIM_REVERSE = "https://nominatim.openstreetmap.org/reverse";
const GOOGLE_REVERSE = "https://maps.googleapis.com/maps/api/geocode/json";

export async function searchCitiesByName(name, { count = 5, language = "en" } = {}) {
	if (!name || !name.trim()) {
		return [];
	}

	const params = new URLSearchParams({
		name: name.trim(),
		count: String(count),
		language,
		format: "json"
	});

	const url = `${GEOCODING_ENDPOINT}?${params.toString()}`;
	const res = await fetch(url);
	if (!res.ok) {
		throw new Error(`Geocoding request failed (${res.status})`);
	}
	const data = await res.json();
	return (data.results || []).map((r) => ({
		id: `${r.latitude},${r.longitude}`,
		name: r.name,
		latitude: r.latitude,
		longitude: r.longitude,
		country: r.country,
		admin1: r.admin1,
		timezone: r.timezone
	}));
}

export async function reverseGeocode(latitude, longitude, { language = "en", count = 1 } = {}) {
	if (typeof latitude !== "number" || typeof longitude !== "number") {
		throw new Error("Latitude and longitude are required numbers");
	}
	const params = new URLSearchParams({
		latitude: String(latitude),
		longitude: String(longitude),
		language,
		count: String(count),
		format: "json"
	});
	const url = `${REVERSE_ENDPOINT}?${params.toString()}`;
	const res = await fetch(url);
	if (!res.ok) {
		throw new Error(`Reverse geocoding failed (${res.status})`);
	}
	const data = await res.json();
	const r = (data && data.results && data.results[0]) || null;
	if (!r) return null;
	return {
		id: `${r.latitude},${r.longitude}`,
		name: r.name,
		latitude: r.latitude,
		longitude: r.longitude,
		country: r.country,
		admin1: r.admin1,
		timezone: r.timezone
	};
}

async function reverseGeocodeNominatim(latitude, longitude, { language = "en" } = {}) {
	const params = new URLSearchParams({
		format: "jsonv2",
		lat: String(latitude),
		lon: String(longitude),
		"accept-language": language,
		zoom: "18", // Increased zoom for more detailed results
		addressdetails: "1"
	});
	const url = `${NOMINATIM_REVERSE}?${params.toString()}`;
	const res = await fetch(url, { headers: { "User-Agent": "weathernow-app/1.0" } });
	if (!res.ok) {
		throw new Error(`Nominatim reverse failed (${res.status})`);
	}
	const data = await res.json();
	const a = data.address || {};
	
	// Build a more specific location name prioritizing village/taluka/district hierarchy
	let derivedName = "";
	let admin1 = "";
	
	// For Indian addresses, prioritize village -> taluka -> district hierarchy
	if (a.country === "India" || a.country_code === "in") {
		// Try to get the most specific location available
		const village = a.village || a.hamlet || a.locality || a.suburb || a.neighbourhood;
		const taluka = a.taluka || a.subdistrict || a.county;
		const district = a.district || a.state_district;
		const state = a.state || a.state_district || a.region;
		
		// Build name with available hierarchy
		if (village) {
			derivedName = village;
			if (taluka && taluka !== village) {
				derivedName += `, ${taluka}`;
			}
			if (district && district !== taluka && district !== village) {
				derivedName += `, ${district}`;
			}
		} else if (taluka) {
			derivedName = taluka;
			if (district && district !== taluka) {
				derivedName += `, ${district}`;
			}
		} else if (district) {
			derivedName = district;
		} else {
			derivedName = a.city || a.town || a.municipality || data.name || "";
		}
		
		admin1 = state || "";
	} else {
		// For non-Indian addresses, use the original logic
		derivedName =
			a.village || a.hamlet || a.locality || a.suburb || a.neighbourhood ||
			a.city || a.town || a.municipality ||
		a.subdistrict || a.state_district || a.county || data.name || "";
		admin1 = a.state || a.state_district || a.region || "";
	}
	
	return {
		id: `${latitude},${longitude}`,
		name: derivedName,
		latitude,
		longitude,
		country: a.country || "",
		admin1,
		timezone: "auto"
	};
}

function haversineKm(aLat, aLon, bLat, bLon) {
	const toRad = (d) => (d * Math.PI) / 180;
	const R = 6371;
	const dLat = toRad(bLat - aLat);
	const dLon = toRad(bLon - aLon);
	const s1 = Math.sin(dLat / 2) ** 2;
	const s2 = Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
	const c = 2 * Math.atan2(Math.sqrt(s1 + s2), Math.sqrt(1 - (s1 + s2)));
	return R * c;
}

export async function resolvePlaceFromCoords(latitude, longitude, { language = "en" } = {}) {
	function score(place) {
		const preferredCodes = new Set(["PPLA", "PPLA2", "PPLA3", "PPLA4", "PPLC", "PPL", "PPLG", "PPLL", "PPLS"]);
		const featureCode = place.feature_code || place.featureClass || "";
		let typeScore = preferredCodes.has(featureCode) ? 3 : 0;
		
		const population = place.population || 0;
		
		// Enhanced scoring for Indian locations - prioritize villages and smaller settlements
		if (place.country === "India" || place.country_code === "in") {
			// Higher score for villages and smaller settlements in India
			if (/village|hamlet|locality/i.test(place.feature || "") || 
				/village|hamlet|locality/i.test(place.name || "")) {
				typeScore = Math.max(typeScore, 4);
			}
			// Lower score for large cities to avoid showing Pune when in a village
			if (/city|metropolitan/i.test(place.feature || "") && 
				(population > 1000000 || /pune|mumbai|delhi|bangalore|chennai|kolkata/i.test(place.name || ""))) {
				typeScore = Math.max(typeScore, 1);
			}
		} else {
			// Original logic for non-Indian locations
		if (/city|town|village/i.test(place.feature || "")) typeScore = Math.max(typeScore, 2);
		}
		const km = haversineKm(latitude, longitude, place.latitude, place.longitude);
		// Prioritize proximity strongly, then type, then population
		return -km * 1000000 + typeScore * 1000 + population * 0.1;
	}

	// Try multiple geocoding services for better accuracy
	const geocodingServices = [
		// 1. Try Nominatim with maximum zoom for most detailed results
		async () => {
			try {
				const params = new URLSearchParams({
					format: "jsonv2",
					lat: String(latitude),
					lon: String(longitude),
					"accept-language": language,
					zoom: "20", // Maximum zoom for most detailed results
					addressdetails: "1"
				});
				const res = await fetch(`${NOMINATIM_REVERSE}?${params.toString()}`, { 
					headers: { "User-Agent": "weathernow-app/1.0" } 
				});
				if (res.ok) {
					const data = await res.json();
					const a = data.address || {};
					
					// Detailed debugging for your location
					console.log('Nominatim raw response:', data);
					console.log('Address components:', a);
					console.log('Available fields:', Object.keys(a));
					
					const result = {
						id: `${latitude},${longitude}`,
						name: buildIndianLocationName(a),
						latitude,
						longitude,
						country: a.country || "",
						admin1: a.state || a.state_district || a.region || "",
						timezone: "auto",
						source: 'nominatim',
						raw_address: a
					};
					
					console.log('Built location name:', result.name);
					return [result];
				}
			} catch (e) {
				console.log('Nominatim geocoding failed:', e);
			}
		 return [];
		},
		
		// 2. Try Nominatim with different zoom level as fallback
		async () => {
			try {
				const params = new URLSearchParams({
					format: "jsonv2",
					lat: String(latitude),
					lon: String(longitude),
					"accept-language": language,
					zoom: "16", // Different zoom level
					addressdetails: "1"
				});
				const res = await fetch(`${NOMINATIM_REVERSE}?${params.toString()}`, { 
					headers: { "User-Agent": "weathernow-app/1.0" } 
				});
		if (res.ok) {
			const data = await res.json();
					const a = data.address || {};
					return [{
						id: `${latitude},${longitude}`,
						name: buildIndianLocationName(a),
						latitude,
						longitude,
						country: a.country || "",
						admin1: a.state || a.state_district || a.region || "",
						timezone: "auto",
						source: 'nominatim-16',
						raw_address: a
					}];
				}
			} catch (e) {
				console.log('Nominatim geocoding (zoom 16) failed:', e);
			}
		 return [];
		},
		
		// 3. Fallback to coordinate-based location if all else fails
		async () => {
			// This is a last resort - just show coordinates with a generic name
			return [{
				id: `${latitude},${longitude}`,
				name: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
				latitude,
				longitude,
				country: "",
				admin1: "",
				timezone: "auto",
				source: 'coordinates'
			}];
		}
	];

	// Helper function to build Indian location names
	function buildIndianLocationName(a) {
		console.log('Building location name from address:', a);
		
		// Check if it's India
		const isIndia = a.country === "India" || a.country_code === "in" || a.country_code === "IN";
		console.log('Is India:', isIndia, 'Country:', a.country, 'Country code:', a.country_code);
		
		if (isIndia) {
			// Try to get the most specific location available
			const village = a.village || a.hamlet || a.locality || a.suburb || a.neighbourhood;
			const taluka = a.taluka || a.subdistrict || a.county;
			const district = a.district || a.state_district;
			const state = a.state || a.state_district || a.region;
			
			console.log('Indian location components:', {
				village, taluka, district, state,
				raw_village: a.village,
				raw_hamlet: a.hamlet,
				raw_locality: a.locality,
				raw_suburb: a.suburb,
				raw_neighbourhood: a.neighbourhood,
				raw_taluka: a.taluka,
				raw_subdistrict: a.subdistrict,
				raw_county: a.county,
				raw_district: a.district,
				raw_state_district: a.state_district,
				raw_state: a.state,
				raw_region: a.region
			});
			
			// Build name with available hierarchy
			if (village) {
				let name = village;
				if (taluka && taluka !== village) {
					name += `, ${taluka}`;
				}
				if (district && district !== taluka && district !== village) {
					name += `, ${district}`;
				}
				console.log('Built village-based name:', name);
				return name;
			} else if (taluka) {
				let name = taluka;
				if (district && district !== taluka) {
					name += `, ${district}`;
				}
				console.log('Built taluka-based name:', name);
				return name;
			} else if (district) {
				console.log('Built district-based name:', district);
				return district;
			} else {
				// Try other fields that might contain location info
				const fallback = a.city || a.town || a.municipality || a.subdistrict || a.state_district || a.county || "";
				console.log('Using fallback name:', fallback);
				return fallback;
			}
		}
		
		// For non-Indian addresses, use the original logic
		const fallback = a.village || a.hamlet || a.locality || a.suburb || a.neighbourhood ||
			   a.city || a.town || a.municipality || a.subdistrict || a.state_district || a.county || "";
		console.log('Non-Indian fallback name:', fallback);
		return fallback;
	}

	// Try all services and combine results
	let allCandidates = [];
	for (const service of geocodingServices) {
		try {
			const results = await service();
			allCandidates = allCandidates.concat(results);
		} catch (e) {
			console.log('Geocoding service failed:', e);
		}
	}

	if (allCandidates.length > 0) {
		// Remove duplicates and sort by score
		const uniqueCandidates = [];
		const seen = new Set();
		
		for (const candidate of allCandidates) {
			const key = `${candidate.latitude.toFixed(4)},${candidate.longitude.toFixed(4)}`;
			if (!seen.has(key)) {
				seen.add(key);
				uniqueCandidates.push(candidate);
			}
		}
		
		uniqueCandidates.sort((a, b) => score(b) - score(a));
		const best = uniqueCandidates[0];
		
		// Debug logging
		console.log('Location candidates:', uniqueCandidates.slice(0, 3));
		console.log('Selected location:', best);
		
		// Test with your specific coordinates to see what data is available
		if (Math.abs(latitude - 18.5246091) < 0.001 && Math.abs(longitude - 73.8786239) < 0.001) {
			console.log('=== DEBUGGING YOUR SPECIFIC LOCATION ===');
			console.log('Your coordinates: 18.5246091, 73.8786239');
			console.log('Expected: Basardge, Gadhinglaj, Kolhapur, Maharashtra');
			console.log('All candidates found:', allCandidates);
		}
		
				return best;
			}

	// Final fallback - return coordinates
	return {
		id: `${latitude},${longitude}`,
		name: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
		latitude,
		longitude,
		country: "",
		admin1: "",
		timezone: "auto"
	};
}

export async function resolveNearbyPlaces(latitude, longitude, { language = "en", count = 10 } = {}) {
	const results = [];
	
	// Use Nominatim for nearby places
	try {
		const params = new URLSearchParams({
			format: "jsonv2",
			lat: String(latitude),
			lon: String(longitude),
			"accept-language": language,
			zoom: "16",
			addressdetails: "1"
		});
		const res = await fetch(`${NOMINATIM_REVERSE}?${params.toString()}`, { 
			headers: { "User-Agent": "weathernow-app/1.0" } 
		});
		if (res.ok) {
			const data = await res.json();
			const a = data.address || {};
			
			// Build location name for nearby places
			function buildLocationName(addr) {
				if (addr.country === "India" || addr.country_code === "in") {
					const village = addr.village || addr.hamlet || addr.locality || addr.suburb || addr.neighbourhood;
					const taluka = addr.taluka || addr.subdistrict || addr.county;
					const district = addr.district || addr.state_district;
					
					if (village) {
						let name = village;
						if (taluka && taluka !== village) {
							name += `, ${taluka}`;
						}
						if (district && district !== taluka && district !== village) {
							name += `, ${district}`;
						}
						return name;
					} else if (taluka) {
						let name = taluka;
						if (district && district !== taluka) {
							name += `, ${district}`;
						}
						return name;
					} else if (district) {
						return district;
					}
				}
				
				return addr.village || addr.hamlet || addr.locality || addr.suburb || addr.neighbourhood ||
					   addr.city || addr.town || addr.municipality || addr.subdistrict || addr.state_district || addr.county || "";
			}
			
				results.push({
				id: `${latitude},${longitude}`,
				name: buildLocationName(a),
				latitude,
				longitude,
				country: a.country || "",
				admin1: a.state || a.state_district || a.region || "",
				timezone: "auto"
			});
		}
	} catch (e) {
		console.log('Nearby places geocoding failed:', e);
	}
	
	// de-duplicate by label
	const seen = new Set();
	const deduped = [];
	for (const r of results) {
		const label = [r.name, r.admin1, r.country].filter(Boolean).join(', ');
		if (label && !seen.has(label)) {
			seen.add(label);
			deduped.push(r);
		}
	}
	return deduped.slice(0, count);
}


