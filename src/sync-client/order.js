function cpCmp(a, b) {
    const ai = a[Symbol.iterator]();
    const bi = b[Symbol.iterator]();
    for (;;) {
        const x = ai.next();
        const y = bi.next();
        if (x.done && y.done)
            return 0;
        if (x.done)
            return -1;
        if (y.done)
            return 1;
        const cx = x.value.codePointAt(0) ?? 0;
        const cy = y.value.codePointAt(0) ?? 0;
        if (cx !== cy)
            return cx < cy ? -1 : 1;
    }
}
const isDigit = (ch) => ch >= "0" && ch <= "9";
function naturalCmpFolded(a, b) {
    const aa = Array.from(a);
    const bb = Array.from(b);
    let i = 0;
    let j = 0;
    for (;;) {
        if (i >= aa.length && j >= bb.length)
            return 0;
        if (i >= aa.length)
            return -1;
        if (j >= bb.length)
            return 1;
        const x = aa[i];
        const y = bb[j];
        const xd = isDigit(x);
        const yd = isDigit(y);
        if (xd && yd) {
            let ie = i;
            let je = j;
            while (ie < aa.length && isDigit(aa[ie]))
                ie++;
            while (je < bb.length && isDigit(bb[je]))
                je++;
            const ra = aa.slice(i, ie).join("").replace(/^0+/, "");
            const rb = bb.slice(j, je).join("").replace(/^0+/, "");
            if (ra.length !== rb.length)
                return ra.length < rb.length ? -1 : 1;
            if (ra !== rb)
                return ra < rb ? -1 : 1;
            i = ie;
            j = je;
        }
        else if (xd !== yd) {
            return cpCmp(x, y);
        }
        else {
            const c = cpCmp(x.toLowerCase(), y.toLowerCase());
            if (c !== 0)
                return c;
            i++;
            j++;
        }
    }
}
export function naturalCmp(a, b) {
    const folded = naturalCmpFolded(a, b);
    return folded !== 0 ? folded : cpCmp(a, b);
}
