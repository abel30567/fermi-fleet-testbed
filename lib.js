export function add(a, b) {
	return a + b
}

export function gradientDescent2D(
	f,
	x0,
	y0,
	lr = 0.01,
	maxIter = 2000,
	tol = 1e-8
) {
	if (typeof f !== 'function') {
		throw new TypeError('f must be a function')
	}
	if (!Number.isFinite(x0) || !Number.isFinite(y0)) {
		throw new TypeError('x0 and y0 must be finite numbers')
	}
	if (!Number.isFinite(lr) || lr <= 0) {
		throw new RangeError('lr must be a positive finite number')
	}
	if (!Number.isInteger(maxIter) || maxIter < 0) {
		throw new RangeError('maxIter must be a non-negative integer')
	}
	if (!Number.isFinite(tol) || tol < 0) {
		throw new RangeError('tol must be a non-negative finite number')
	}

	const hBase = 6e-6
	let x = x0
	let y = y0
	let fx = f(x, y)
	if (!Number.isFinite(fx)) {
		throw new RangeError('f(x0, y0) must be a finite number')
	}

	let iterations = 0
	for (let i = 0; i < maxIter; i++) {
		const hx = hBase * Math.max(1, Math.abs(x))
		const hy = hBase * Math.max(1, Math.abs(y))
		const gx = (f(x + hx, y) - f(x - hx, y)) / (2 * hx)
		const gy = (f(x, y + hy) - f(x, y - hy)) / (2 * hy)

		if (!Number.isFinite(gx) || !Number.isFinite(gy)) {
			throw new RangeError('Gradient evaluated to a non-finite value')
		}

		if (Math.hypot(gx, gy) <= tol) {
			break
		}

		const nextX = x - lr * gx
		const nextY = y - lr * gy
		const nextFx = f(nextX, nextY)

		if (
			!Number.isFinite(nextX) ||
			!Number.isFinite(nextY) ||
			!Number.isFinite(nextFx)
		) {
			throw new RangeError('Gradient descent diverged to a non-finite value')
		}

		iterations = i + 1
		const unchanged = nextX === x && nextY === y
		x = nextX
		y = nextY
		fx = nextFx

		if (unchanged) {
			break
		}
	}

	return { x, y, fx, iterations }
}
