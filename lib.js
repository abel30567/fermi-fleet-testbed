export function add(a, b) {
	return a + b
}

export function rk4ODE(f, t0, y0, tEnd, steps = 100) {
	if (typeof f !== 'function') {
		throw new TypeError('f must be a function')
	}
	if (typeof t0 !== 'number' || !Number.isFinite(t0)) {
		throw new TypeError('t0 must be a finite number')
	}
	if (typeof tEnd !== 'number' || !Number.isFinite(tEnd)) {
		throw new TypeError('tEnd must be a finite number')
	}
	if (!Number.isInteger(steps) || steps <= 0) {
		throw new RangeError('steps must be a positive integer')
	}

	const isVector = Array.isArray(y0)
	if (isVector) {
		for (let i = 0; i < y0.length; i++) {
			if (typeof y0[i] !== 'number' || !Number.isFinite(y0[i])) {
				throw new TypeError('y0 elements must be finite numbers')
			}
		}
	} else if (typeof y0 !== 'number' || !Number.isFinite(y0)) {
		throw new TypeError('y0 must be a finite number or an array of finite numbers')
	}

	if (tEnd === t0) {
		return isVector ? [...y0] : y0
	}

	const h = (tEnd - t0) / steps
	const halfH = h / 2

	if (!isVector) {
		let y = y0
		for (let i = 0; i < steps; i++) {
			const t = t0 + i * h
			const k1 = f(t, y)
			const k2 = f(t + halfH, y + halfH * k1)
			const k3 = f(t + halfH, y + halfH * k2)
			const k4 = f(t + h, y + h * k3)
			y += (h / 6) * (k1 + 2 * k2 + 2 * k3 + k4)
		}
		return y
	}

	const dim = y0.length
	let y = [...y0]
	for (let i = 0; i < steps; i++) {
		const t = t0 + i * h
		const k1 = f(t, y)
		const y2 = new Array(dim)
		for (let j = 0; j < dim; j++) y2[j] = y[j] + halfH * k1[j]
		const k2 = f(t + halfH, y2)
		const y3 = new Array(dim)
		for (let j = 0; j < dim; j++) y3[j] = y[j] + halfH * k2[j]
		const k3 = f(t + halfH, y3)
		const y4 = new Array(dim)
		for (let j = 0; j < dim; j++) y4[j] = y[j] + h * k3[j]
		const k4 = f(t + h, y4)
		const next = new Array(dim)
		for (let j = 0; j < dim; j++) {
			next[j] = y[j] + (h / 6) * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j])
		}
		y = next
	}
	return y
}
