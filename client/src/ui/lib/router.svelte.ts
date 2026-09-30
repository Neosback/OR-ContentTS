/** Tiny history router for the Studio SPA (about seven routes; no params in the path). */

export interface NavigateOptions {
    replace?: boolean;
}

class Router {
    path = $state(window.location.pathname);
    search = $state(window.location.search);

    constructor() {
        window.addEventListener("popstate", () => this.sync());
    }

    private sync(): void {
        this.path = window.location.pathname;
        this.search = window.location.search;
    }

    /** Current query string as URLSearchParams (reactive: reads `search`). */
    get params(): URLSearchParams {
        return new URLSearchParams(this.search);
    }

    /** Navigate to a path (optionally with a query string), pushing or replacing history. */
    navigate(to: string, options: NavigateOptions = {}): void {
        const url = new URL(to, window.location.href);
        if (url.origin !== window.location.origin) {
            window.location.assign(url.href);
            return;
        }
        const next = url.pathname + url.search + url.hash;
        const current = window.location.pathname + window.location.search + window.location.hash;
        if (next !== current) {
            if (options.replace) window.history.replaceState(null, "", next);
            else window.history.pushState(null, "", next);
        }
        this.sync();
    }

    /** Replace the query string in place (camera sync etc.); never adds a history entry by default. */
    setSearchParams(params: ConstructorParameters<typeof URLSearchParams>[0], options: NavigateOptions = { replace: true }): void {
        const query = new URLSearchParams(params).toString();
        this.navigate(this.path + (query ? `?${query}` : ""), options);
    }

    /** Whether `pathname` is the route `href` or lives beneath it (`/` only matches exactly). */
    isActive(href: string): boolean {
        return this.path === href || (href !== "/" && this.path.startsWith(`${href}/`));
    }
}

export const router = new Router();

/** Svelte action for in-app links: `<a href="/map" use:link>` navigates without a page load. */
export function link(node: HTMLAnchorElement): { destroy(): void } {
    const onClick = (event: MouseEvent): void => {
        if (event.defaultPrevented || event.button !== 0) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        if (node.target && node.target !== "_self") return;
        const url = new URL(node.href, window.location.href);
        if (url.origin !== window.location.origin) return;
        event.preventDefault();
        router.navigate(url.pathname + url.search + url.hash);
    };
    node.addEventListener("click", onClick);
    return { destroy: () => node.removeEventListener("click", onClick) };
}
