export function add(a, b) {
	return a + b
}

const INV_SQRT3 = 1 / Math.sqrt(3)

export function arcLength3D(r, t0, t1, n = 1000) {
	if (typeof r !== 'function') {
		throw new TypeError('r must be a function')
	}
	if (!Number.isFinite(t0) || !Number.isFinite(t1)) {
		throw new RangeError('t0 and t1 must be finite numbers')
	}
	if (!Number.isInteger(n) || n <= 0) {
		throw new RangeError('n must be a positive integer')
	}
	if (t0 === t1) {
		return 0
	}

	const h = (t1 - t0) / n
	let [x0, y0, z0] = r(t0)
	let total = 0

	for (let i = 0; i < n; i++) {
		const tm = t0 + (i + 0.5) * h
		const tb = i === n - 1 ? t1 : t0 + (i + 1) * h
		const [xm, ym, zm] = r(tm)
		const [x1, y1, z1] = r(tb)

		const ax = (x1 - x0) * 0.5
		const ay = (y1 - y0) * 0.5
		const az = (z1 - z0) * 0.5

		const bx = (x1 - 2 * xm + x0) * INV_SQRT3
		const by = (y1 - 2 * ym + y0) * INV_SQRT3
		const bz = (z1 - 2 * zm + z0) * INV_SQRT3

		total +=
			Math.hypot(ax - bx, ay - by, az - bz) +
			Math.hypot(ax + bx, ay + by, az + bz)

		x0 = x1
		y0 = y1
		z0 = z1
	}

	return total
}
