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
		throw new TypeError('r(t) must return a 3-element array of finite numbers')
	}
	return p
}

export function normalVector3D(r, t, h = 1e-4) {
	if (typeof r !== 'function') {
		throw new TypeError('r must be a function')
	}
	if (typeof t !== 'number' || !Number.isFinite(t)) {
		throw new TypeError('t must be a finite number')
	}
	if (typeof h !== 'number' || !Number.isFinite(h) || h <= 0) {
		throw new RangeError('h must be a positive finite number')
	}

	const pMinus = evalPoint3D(r, t - h)
	const p0 = evalPoint3D(r, t)
	const pPlus = evalPoint3D(r, t + h)

	const inv2h = 1 / (2 * h)
	const invh2 = 1 / (h * h)

	const dx = (pPlus[0] - pMinus[0]) * inv2h
	const dy = (pPlus[1] - pMinus[1]) * inv2h
	const dz = (pPlus[2] - pMinus[2]) * inv2h

	const speed = Math.hypot(dx, dy, dz)
	const scale = Math.max(
		Math.hypot(pMinus[0], pMinus[1], pMinus[2]),
		Math.hypot(p0[0], p0[1], p0[2]),
		Math.hypot(pPlus[0], pPlus[1], pPlus[2]),
		1
	)

	if (speed <= Math.max(1e-12, 16 * Number.EPSILON * scale * inv2h)) {
		throw new Error('Principal normal vector is undefined at a singular point (zero speed)')
	}

	const tx = dx / speed
	const ty = dy / speed
	const tz = dz / speed

	const ddx = (pPlus[0] - 2 * p0[0] + pMinus[0]) * invh2
	const ddy = (pPlus[1] - 2 * p0[1] + pMinus[1]) * invh2
	const ddz = (pPlus[2] - 2 * p0[2] + pMinus[2]) * invh2

	// Project out the tangential acceleration component: v = r'' - (r'' . T) * T
	const dot = ddx * tx + ddy * ty + ddz * tz
	const vx = ddx - dot * tx
	const vy = ddy - dot * ty
	const vz = ddz - dot * tz

	const vNorm = Math.hypot(vx, vy, vz)
	if (vNorm <= Math.max(1e-12, 16 * Number.EPSILON * scale * invh2)) {
		throw new Error('Principal normal vector is undefined where curvature is zero')
	}

	return [vx / vNorm, vy / vNorm, vz / vNorm]
}
