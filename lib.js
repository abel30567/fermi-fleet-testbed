export function add(a, b) {
	return a + b
}

export function directionalDerivative(f, point, dir, h = 1e-6) {
	if (typeof f !== 'function') {
		throw new TypeError('f must be a function')
	}
	if (!Array.isArray(point) || !Array.isArray(dir)) {
		throw new TypeError('point and dir must be arrays')
	}
	if (point.length !== dir.length) {
		throw new Error('point and dir must have the same length')
	}
	if (!Number.isFinite(h) || h <= 0) {
		throw new RangeError('h must be a positive finite number')
	}

	let maxAbs = 0
	for (let i = 0; i < dir.length; i++) {
		const a = Math.abs(dir[i])
		if (a > maxAbs) maxAbs = a
	}
	if (maxAbs === 0) {
		throw new Error('Direction vector must be non-zero')
	}

	let sumSq = 0
	for (let i = 0; i < dir.length; i++) {
		const s = dir[i] / maxAbs
		sumSq += s * s
	}
	const norm = maxAbs * Math.sqrt(sumSq)
	if (!Number.isFinite(norm) || norm === 0) {
		throw new Error('Direction vector must be non-zero and finite')
	}

	const n = point.length
	const plus = new Array(n)
	const minus = new Array(n)
	for (let i = 0; i < n; i++) {
		const step = h * (dir[i] / norm)
		plus[i] = point[i] + step
		minus[i] = point[i] - step
	}

	return (f(plus) - f(minus)) / (2 * h)
}
