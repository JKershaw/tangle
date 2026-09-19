/** A class indented with four spaces, fields as arrow functions, a getter and overloads. */
export class Wide {
    private items: string[] = [];

    // A field holding an arrow function is a declaration too.
    private normalise = (text: string): string => {
        return text.trim().toLowerCase();
    };

    get size(): number {
        return this.items.length;
    }

    add(item: string): void;
    add(item: string, twice: boolean): void;
    add(item: string, twice = false): void {
        this.items.push(this.normalise(item));
        if (twice) this.items.push(this.normalise(item));
    }

    public static async load(path: string): Promise<Wide> {
        const wide = new Wide();
        for (const line of (await readFile(path, 'utf8')).split('\n')) {
            if (line) wide.add(line);
        }
        return wide;
    }
}

export default function helper(value: number): number {
    return value * 2;
}

export const pick = (list: string[]): string | undefined => list[0];
