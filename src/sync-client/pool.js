export async function mapLimit(items, limit, fn) {
    const results = new Array(items.length);
    let next = 0;
    const width = Math.max(1, Math.min(limit, items.length));
    const worker = async () => {
        for (let i = next++; i < items.length; i = next++) {
            results[i] = await fn(items[i], i);
        }
    };
    await Promise.all(Array.from({ length: width }, worker));
    return results;
}
