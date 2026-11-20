export function add(a, b) {
	return a + b
}

export function rk4System(f, t0, y0Vec, tEnd, steps = 100) {
	if (typeof f !== 'function') {
		throw new TypeError('f must be a function')
	}
	if (!Array.isArray(y0Vec)) {
		throw new TypeError('y0Vec must be an array')
	}
	if (!Number.isFinite(t0) || !Number.isFinite(tEnd)) {
		throw new RangeError('t0 and tEnd must be finite numbers')
	}
	if (!Number.isInteger(steps) || steps <= 0) {
		throw new RangeError('steps must be a positive integer')
	}

	const n = y0Vec.length
	const y = y0Vec.slice()

	if (n === 0 || tEnd === t0) {
		return y
	}

	const h = (tEnd - t0) / steps
	const halfH = h * 0.5
	const sixthH = h / 6

	for (let step = 0; step < steps; step++) {
		const t = t0 + step * h
		const k1 = f(t, y.slice())

		const y2 = new Array(n)
		for (let i = 0; i < n; i++) {
			y2[i] = y[i] + halfH * k1[i]
		}
		const k2 = f(t + halfH, y2)

		const y3 = new Array(n)
		for (let i = 0; i < n; i++) {
			y3[i] = y[i] + halfH * k2[i]
		}
		const k3 = f(t + halfH, y3)

		const y4 = new Array(n)
		for (let i = 0; i < n; i++) {
			y4[i] = y[i] + h * k3[i]
		}
		const k4 = f(t + h, y4)

		for (let i = 0; i < n; i++) {
			y[i] += sixthH * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i])
		}
	}

	return y
}
