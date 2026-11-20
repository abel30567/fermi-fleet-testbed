export function add(a, b) {
	return a + b
}

export function curvature2D(rx, ry, t, h = 1e-4) {
	if (typeof rx !== 'function' || typeof ry !== 'function') {
		throw new TypeError('rx and ry must be functions')
	}
	if (!Number.isFinite(t)) {
		throw new RangeError('t must be a finite number')
	}
	if (!Number.isFinite(h) || h <= 0) {
		throw new RangeError('h must be a positive finite number')
	}

	const xm = rx(t - h)
	const x0 = rx(t)
	const xp = rx(t + h)

	const ym = ry(t - h)
	const y0 = ry(t)
	const yp = ry(t + h)

	const dx = (xp - xm) / (2 * h)
	const dy = (yp - ym) / (2 * h)
	const speedSq = dx * dx + dy * dy

	if (speedSq === 0) {
		throw new RangeError('Curve velocity is zero at t; curvature is undefined')
	}

	const ddx = (xp - 2 * x0 + xm) / (h * h)
	const ddy = (yp - 2 * y0 + ym) / (h * h)

	return Math.abs(dx * ddy - dy * ddx) / (speedSq * Math.sqrt(speedSq))
}
