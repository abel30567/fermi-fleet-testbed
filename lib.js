export function add(a, b) {
	return a + b
}

export function distance3(p, q) {
	const [x1, y1, z1] = p
	const [x2, y2, z2] = q
	return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2 + (z2 - z1) ** 2)
}
