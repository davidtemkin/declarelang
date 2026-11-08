// columns — is a view one of a `columns` grid's cells? Asked by the boot check
// (a 0-wide cell) and the size report (a cell whose size nothing decides), so
// it lives apart from both, importing nothing.
/** Is this view laid by its parent's `columns` grid (a WrappingLayout's cells)? */
export function inColumns(v) {
    const l = v.parent?.layout;
    if (l === null || l === undefined || typeof l.columns !== "number" || l.columns < 1)
        return false;
    for (let c = l.constructor; c && c !== Object; c = Object.getPrototypeOf(c))
        if (c.name === "WrappingLayout")
            return true;
    return false;
}
//# sourceMappingURL=columns.js.map