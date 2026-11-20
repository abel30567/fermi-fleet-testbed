export function add(a, b) {
	return a + b
}

export function biharmonic2D(f, x, y, h = 1e-2) {
	if (typeof f !== 'function') {
		throw new TypeError('f must be a function')
	}
	if (!Number.isFinite(x) || !Number.isFinite(y)) {
		throw new RangeError('x and y must be finite numbers')
	}
	if (!Number.isFinite(h) || h <= 0) {
		throw new RangeError('h must be a positive finite number')
	}

	const h2 = 2 * h
	const center = 20 * f(x, y)
	const axial1 =
		-8 * (f(x + h, y) + f(x - h, y) + f(x, y + h) + f(x, y - h))
	const diag =
		2 *
		(f(x + h, y + h) +
			f(x + h, y - h) +
			f(x - h, y + h) +
			f(x - h, y - h))
	const axial2 = f(x + h2, y) + f(x - h2, y) + f(x, y + h2) + f(x, y - h2)

	return (center + axial1 + diag + axial2) / (h ** 4)
}
