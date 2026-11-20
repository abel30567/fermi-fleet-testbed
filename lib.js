export function add(a, b) {
	return a + b
}

export function surfaceNormal(f, x, y, h = 1e-6) {
	if (typeof f !== 'function') {
		throw new TypeError('f must be a function')
	}
	if (!Number.isFinite(x) || !Number.isFinite(y)) {
		throw new RangeError('x and y must be finite numbers')
	}
	if (!Number.isFinite(h) || h <= 0) {
		throw new RangeError('h must be a positive finite number')
	}

	const fx = (f(x + h, y) - f(x - h, y)) / (2 * h)
	const fy = (f(x, y + h) - f(x, y - h)) / (2 * h)

	if (!Number.isFinite(fx) || !Number.isFinite(fy)) {
		throw new RangeError('partial derivatives must be finite')
	}

	const norm = Math.hypot(fx, fy, 1)
	const nx = fx === 0 ? 0 : -fx / norm
	const ny = fy === 0 ? 0 : -fy / norm
	const nz = 1 / norm

	return [nx, ny, nz]
}
