// The signed-in user's token, kept in the browser as the RealWorld spec asks,
// so a reload stays signed in. Storage can be refused; then a reload signs out.

const KEY = "conduit/jwt"

export function loadToken(): string {
    try { return localStorage.getItem(KEY) ?? "" } catch { return "" }
}

export function saveToken(token: string): void {
    try {
        if (token == "") localStorage.removeItem(KEY)
        else localStorage.setItem(KEY, token)
    } catch { }
}
