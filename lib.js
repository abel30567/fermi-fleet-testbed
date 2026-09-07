export function add(a, b) {
	return a + b
}

export function tripleIntegralMid(f, ax, bx, ay, by, az, bz, n = 30) {
	const hx = (bx - ax) / n
	const hy = (by - ay) / n
	const hz = (bz - az) / n
	let sum = 0
	for (let i = 0; i < n; i++) {
		const x = ax + (i + 0.5) * hx
		for (let j = 0; j < n; j++) {
			const y = ay + (j + 0.5) * hy
			for (let k = 0; k < n; k++) {
				const z = az + (k + 0.5) * hz
				sum += f(x, y, z)
			}
		}
	}
	return sum * hx * hy * hz
}
