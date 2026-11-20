export function add(a, b) {
	return a + b
}

export function bezierEval(points, t) {
	if (!Array.isArray(points) || points.length === 0) {
		throw new RangeError('points must be a non-empty array of [x, y] coordinates')
	}
	if (typeof t !== 'number' || !Number.isFinite(t)) {
		throw new TypeError('t must be a finite number')
	}

	const n = points.length
	const work = new Array(n)
	for (let i = 0; i < n; i++) {
		const pt = points[i]
		if (
			!Array.isArray(pt) ||
			pt.length !== 2 ||
			typeof pt[0] !== 'number' ||
			typeof pt[1] !== 'number' ||
			!Number.isFinite(pt[0]) ||
			!Number.isFinite(pt[1])
		) {
			throw new TypeError(`Invalid 2D point at index ${i}`)
		}
		work[i] = [pt[0], pt[1]]
	}

	const oneMinusT = 1 - t
	for (let k = n - 1; k >= 1; k--) {
		for (let i = 0; i < k; i++) {
			work[i] = [
				oneMinusT * work[i][0] + t * work[i + 1][0],
				oneMinusT * work[i][1] + t * work[i + 1][1],
			]
		}
	}

	return work[0]
}
