export function add(a, b) {
	return a + b
}

export function hessianN(f, point, h = 1e-4) {
	const n = point.length
	const H = Array.from({ length: n }, () => new Array(n).fill(0))
	const f0 = f(point)

	for (let i = 0; i < n; i++) {
		for (let j = i; j < n; j++) {
			let value
			if (i === j) {
				const plus = [...point]
				const minus = [...point]
				plus[i] += h
				minus[i] -= h
				value = (f(plus) - 2 * f0 + f(minus)) / (h * h)
			} else {
				const pp = [...point]
				const pm = [...point]
				const mp = [...point]
				const mm = [...point]
				pp[i] += h; pp[j] += h
				pm[i] += h; pm[j] -= h
				mp[i] -= h; mp[j] += h
				mm[i] -= h; mm[j] -= h
				value = (f(pp) - f(pm) - f(mp) + f(mm)) / (4 * h * h)
			}
			H[i][j] = value
			H[j][i] = value
		}
	}

	return H
}
