export function add(a, b) {
	return a + b
}

export function mixedPartial(f, x, y, h = 1e-4) {
	if (typeof f !== 'function') {
		throw new TypeError('f must be a function')
	}
	if (!Number.isFinite(x) || !Number.isFinite(y)) {
		throw new RangeError('x and y must be finite numbers')
	}
	if (!Number.isFinite(h) || h <= 0) {
		throw new RangeError('h must be a positive finite number')
	}
	const fpp = f(x + h, y + h)
	const fpm = f(x + h, y - h)
	const fmp = f(x - h, y + h)
	const fmm = f(x - h, y - h)
	return (fpp - fpm - fmp + fmm) / (4 * h * h)
}
