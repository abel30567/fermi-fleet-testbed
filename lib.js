export function add(a, b) {
	return a + b
}

export function torsion3D(r, t, h = 1e-3) {
	if (typeof r !== 'function') {
		throw new TypeError('r must be a function returning [x, y, z]')
	}
	if (typeof t !== 'number' || !Number.isFinite(t)) {
		throw new RangeError('t must be a finite number')
	}
	if (typeof h !== 'number' || !Number.isFinite(h) || h <= 0) {
		throw new RangeError('h must be a positive finite number')
	}

	const pM2 = r(t - 2 * h)
	const pM1 = r(t - h)
	const p0 = r(t)
	const pP1 = r(t + h)
	const pP2 = r(t + 2 * h)

	const d1 = [0, 0, 0]
	const d2 = [0, 0, 0]
	const d3 = [0, 0, 0]
	const inv12h = 1 / (12 * h)
	const inv12h2 = 1 / (12 * h * h)
	const inv2h3 = 1 / (2 * h * h * h)

	for (let i = 0; i < 3; i++) {
		d1[i] = (-pP2[i] + 8 * pP1[i] - 8 * pM1[i] + pM2[i]) * inv12h
		d2[i] = (-pP2[i] + 16 * pP1[i] - 30 * p0[i] + 16 * pM1[i] - pM2[i]) * inv12h2
		d3[i] = (pP2[i] - 2 * pP1[i] + 2 * pM1[i] - pM2[i]) * inv2h3
	}

	const cx = d1[1] * d2[2] - d1[2] * d2[1]
	const cy = d1[2] * d2[0] - d1[0] * d2[2]
	const cz = d1[0] * d2[1] - d1[1] * d2[0]

	const denom = cx * cx + cy * cy + cz * cz
	if (denom === 0) {
		return 0
	}

	const numer = cx * d3[0] + cy * d3[1] + cz * d3[2]
	return numer / denom
}
