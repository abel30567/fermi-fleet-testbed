export function add(a, b) {
	return a + b
}

export function vecProject(u, v) {
	if (!Array.isArray(u) || !Array.isArray(v)) {
		throw new TypeError("Vectors u and v must be arrays")
	}
	if (u.length !== v.length) {
		throw new RangeError("Vectors u and v must have the same length")
	}
	if (v.length === 0) {
		throw new RangeError("Vectors must not be empty")
	}

	let uDotV = 0
	let vDotV = 0
	for (let i = 0; i < v.length; i++) {
		const ui = u[i]
		const vi = v[i]
		if (typeof ui !== "number" || !Number.isFinite(ui) || typeof vi !== "number" || !Number.isFinite(vi)) {
			throw new TypeError("Vector elements must be finite numbers")
		}
		uDotV += ui * vi
		vDotV += vi * vi
	}

	if (vDotV === 0) {
		throw new RangeError("Cannot project onto the zero vector")
	}

	const scalar = uDotV / vDotV
	const result = new Array(v.length)
	for (let i = 0; i < v.length; i++) {
		const val = scalar * v[i]
		result[i] = val === 0 ? 0 : val
	}
	return result
}
