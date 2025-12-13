
export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        if (typeof localStorage === 'undefined' || typeof localStorage.getItem !== 'function') {
            const localStorageMock = {
                getItem: () => null,
                setItem: () => { },
                removeItem: () => { },
                clear: () => { },
                length: 0,
                key: () => null,
            };
            (global as unknown as { localStorage: typeof localStorageMock }).localStorage = localStorageMock;
        }
    }
}
