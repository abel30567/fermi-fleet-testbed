export function add(a, b) {
	return a + b
}

function evalPoint3D(r, t) {
	const p = r(t)
	if (
		!Array.isArray(p) ||
		p.length !== 3 ||
		!Number.isFinite(p[0]) ||
		!Number.isFinite(p[1]) ||
		!Number.isFinite(p[2])
	) {
		throw new TypeError('Curve function r(t) must return a finite 3D vector [x, y, z]')
	}
	return p
}

export function binormalVector3D(r, t, h = 1e-4) {
	if (typeof r !== 'function') {
		throw new TypeError('Curve r must be a function')
	}
	if (typeof t !== 'number' || !Number.isFinite(t)) {
		throw new RangeError('Parameter t must be a finite number')
	}
	if (typeof h !== 'number' || !Number.isFinite(h) || h <= 0) {
		throw new RangeError('Step size h must be a positive finite number')
	}

	const pMinus = evalPoint3D(r, t - h)
	const p0 = evalPoint3D(r, t)
	const pPlus = evalPoint3D(r, t + h)

	const inv2h = 1 / (2 * h)
	const invh2 = 1 / (h * h)

	const dx = (pPlus[0] - pMinus[0]) * inv2h
	const dy = (pPlus[1] - pMinus[1]) * inv2h
	const dz = (pPlus[2] - pMinus[2]) * inv2h

	const ddx = (pPlus[0] - 2 * p0[0] + pMinus[0]) * invh2
	const ddy = (pPlus[1] - 2 * p0[1] + pMinus[1]) * invh2
	const ddz = (pPlus[2] - 2 * p0[2] + pMinus[2]) * invh2

	const vNorm = Math.hypot(dx, dy, dz)
	if (vNorm <= 1e-12) {
		throw new Error('Binormal vector is undefined when curve velocity is zero')
	}

	const cx = dy * ddz - dz * ddy
	const cy = dz * ddx - dx * ddz
	const cz = dx * ddy - dy * ddx
	const cNorm = Math.hypot(cx, cy, cz)

	const pScale = Math.max(
		1,
		Math.hypot(pMinus[0], pMinus[1], pMinus[2]),
		Math.hypot(p0[0], p0[1], p0[2]),
		Math.hypot(pPlus[0], pPlus[1], pPlus[2])
	)
	const noiseFloor = Math.max(1e-12, 64 * Number.EPSILON * vNorm * pScale * invh2)
	if (cNorm <= noiseFloor) {
		throw new Error('Binormal vector is undefined when curvature is zero')
	}

	const bx = cx / cNorm
	const by = cy / cNorm
	const bz = cz / cNorm

	return [bx === 0 ? 0 : bx, by === 0 ? 0 : by, bz === 0 ? 0 : bz]
}
