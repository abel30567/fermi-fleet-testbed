export function add(a, b) {
	return a + b
}

export function cubicHermite(t, p0, m0, p1, m1) {
	if (
		typeof t !== 'number' || !Number.isFinite(t) ||
		typeof p0 !== 'number' || !Number.isFinite(p0) ||
		typeof m0 !== 'number' || !Number.isFinite(m0) ||
		typeof p1 !== 'number' || !Number.isFinite(p1) ||
		typeof m1 !== 'number' || !Number.isFinite(m1)
	) {
		throw new TypeError('All arguments must be finite numbers')
	}
	if (t < 0 || t > 1) {
		throw new RangeError('Parameter t must be in [0, 1]')
	}
	const t2 = t * t
	const t3 = t2 * t
	const h00 = 2 * t3 - 3 * t2 + 1
	const h10 = t3 - 2 * t2 + t
	const h01 = -2 * t3 + 3 * t2
	const h11 = t3 - t2
	return h00 * p0 + h10 * m0 + h01 * p1 + h11 * m1
}
