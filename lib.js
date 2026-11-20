export function add(a, b) {
	return a + b
}

function vectorNorm(v) {
	let maxAbs = 0
	for (let i = 0; i < v.length; i++) {
		const val = v[i]
		if (typeof val !== 'number' || !Number.isFinite(val)) {
			throw new RangeError('Vector components must be finite numbers')
		}
		const a = Math.abs(val)
		if (a > maxAbs) maxAbs = a
	}
	if (maxAbs === 0) return 0
	let sumSq = 0
	for (let i = 0; i < v.length; i++) {
		const scaled = v[i] / maxAbs
		sumSq += scaled * scaled
	}
	return maxAbs * Math.sqrt(sumSq)
}

export function vecAngle(u, v) {
	if (!Array.isArray(u) || !Array.isArray(v)) {
		throw new TypeError('Both u and v must be arrays')
	}
	if (u.length === 0 || u.length !== v.length) {
		throw new RangeError('Vectors must be non-empty and have the same dimension')
	}
	const normU = vectorNorm(u)
	const normV = vectorNorm(v)
	if (normU === 0 || normV === 0) {
		throw new RangeError('Vectors must be non-zero')
	}
	let diffSq = 0
	let sumSq = 0
	for (let i = 0; i < u.length; i++) {
		const ui = u[i] / normU
		const vi = v[i] / normV
		const d = ui - vi
		const s = ui + vi
		diffSq += d * d
		sumSq += s * s
	}
	return 2 * Math.atan2(Math.sqrt(diffSq), Math.sqrt(sumSq))
}
