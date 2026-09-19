/**
 * A tiny document store: one JSON file per collection.
 */
import { matchesFilter } from './match.ts';
import { Mutex } from './mutex.ts';

export class Store {
  private mutex = new Mutex();

  constructor(private readonly dir: string) {}

  // Reads every document of a collection from its file.
  async readAll(name: string): Promise<object[]> {
    const text = await readFile(this.path(name), 'utf8');
    return JSON.parse(text);
  }

  // Writes the whole collection back: to a temp file, then a rename, so a
  // crash mid-write leaves the old file intact.
  async writeAll(name: string, docs: object[]): Promise<void> {
    return this.mutex.runExclusive(async () => {
      const tmp = this.path(name) + '.tmp';
      await writeFile(tmp, JSON.stringify(docs));
      await rename(tmp, this.path(name));
    });
  }

  async find(name: string, filter: object): Promise<object[]> {
    const docs = await this.readAll(name);
    return docs.filter((doc) => matchesFilter(doc, filter));
  }

  private path(name: string): string {
    return `${this.dir}/${name}.json`;
  }
}
