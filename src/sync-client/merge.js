export function threeWayMerge(base, client, server) {
    if (client === base)
        return { kind: "clean", text: server };
    if (server === base)
        return { kind: "clean", text: client };
    if (client === server)
        return { kind: "clean", text: client };
    const b = base.split("\n");
    const c = client.split("\n");
    const s = server.split("\n");
    if (b.length === c.length && b.length === s.length) {
        const out = [];
        for (let i = 0; i < b.length; i++) {
            if (c[i] === b[i])
                out.push(s[i]);
            else if (s[i] === b[i])
                out.push(c[i]);
            else if (c[i] === s[i])
                out.push(c[i]);
            else
                return { kind: "conflict", server, client };
        }
        return { kind: "clean", text: out.join("\n") };
    }
    return { kind: "conflict", server, client };
}
