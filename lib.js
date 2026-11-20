export function add(a, b) {
	return a + b
}

export function heunODE(f, t0, y0, tEnd, steps = 100) {
	if (typeof f !== 'function') {
		throw new TypeError('f must be a function')
	}
	if (!Number.isFinite(t0) || !Number.isFinite(y0) || !Number.isFinite(tEnd)) {
		throw new RangeError('t0, y0, and tEnd must be finite numbers')
	}
	if (!Number.isInteger(steps) || steps <= 0) {
		throw new RangeError('steps must be a positive integer')
	}
	if (tEnd === t0) {
		return y0
	}

	const h = (tEnd - t0) / steps
	let y = y0
	for (let i = 0; i < steps; i++) {
		const t = t0 + i * h
		const tNext = i === steps - 1 ? tEnd : t0 + (i + 1) * h
		const k1 = f(t, y)
		const yPred = y + h * k1
		const k2 = f(tNext, yPred)
		y = y + (h / 2) * (k1 + k2)
	}
	return y
}
