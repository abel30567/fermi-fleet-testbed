export function add(a, b) {
	return a + b
}

export function arcLength3(rx, ry, rz, t0, t1, n = 1000) {
	const h = (t1 - t0) / n
	let length = 0
	let px = rx(t0), py = ry(t0), pz = rz(t0)
	for (let i = 1; i <= n; i++) {
		const t = t0 + i * h
		const x = rx(t), y = ry(t), z = rz(t)
		length += Math.sqrt((x - px) ** 2 + (y - py) ** 2 + (z - pz) ** 2)
		px = x; py = y; pz = z
	}
	return length
}
