/** Where a hosted program asked to go: the resolved address, the program it
 *  names (a `.declare` file or a program directory; "" when it names none), the
 *  location in its fragment, and whether it asked for a new window. */
export interface IslandNavigation {
    to: string;
    program: string;
    location: string;
    newWindow: boolean;
}
/** The record a navigation is handed to whoever carries it out — an island's
 *  onNavigate, or an embedding page's `boot({ onNavigate })`. */
export declare function navigationOf(to: string, newWindow: boolean): IslandNavigation;
