export function add(a, b) {
	return a + b
}

export function curvature3D(r, t, h = 1e-4) {
	if (typeof r !== 'function') {
		throw new TypeError('r must be a function')
	}
	if (typeof t !== 'number' || !Number.isFinite(t)) {
		throw new TypeError('t must be a finite number')
	}
	if (typeof h !== 'number' || !Number.isFinite(h) || h <= 0) {
		throw new RangeError('h must be a positive finite number')
	}

	const pPrev = r(t - h)
	const pCurr = r(t)
	const pNext = r(t + h)

	for (const p of [pPrev, pCurr, pNext]) {
		if (
			!Array.isArray(p) ||
			p.length !== 3 ||
			!Number.isFinite(p[0]) ||
			!Number.isFinite(p[1]) ||
			!Number.isFinite(p[2])
		) {
			throw new TypeError('r(t) must return a 3D array [x, y, z] of finite numbers')
		}
	}

	const inv2h = 1 / (2 * h)
	const invh2 = 1 / (h * h)

	const d1x = (pNext[0] - pPrev[0]) * inv2h
	const d1y = (pNext[1] - pPrev[1]) * inv2h
	const d1z = (pNext[2] - pPrev[2]) * inv2h

	const d2x = ((pNext[0] - pCurr[0]) - (pCurr[0] - pPrev[0])) * invh2
	const d2y = ((pNext[1] - pCurr[1]) - (pCurr[1] - pPrev[1])) * invh2
	const d2z = ((pNext[2] - pCurr[2]) - (pCurr[2] - pPrev[2])) * invh2

	const speed = Math.hypot(d1x, d1y, d1z)
	if (speed === 0) {
		return Number.NaN
	}

	const cx = d1y * d2z - d1z * d2y
	const cy = d1z * d2x - d1x * d2z
	const cz = d1x * d2y - d1y * d2x

	const crossNorm = Math.hypot(cx, cy, cz)
	return crossNorm / (speed * speed * speed)
}
