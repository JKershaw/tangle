// A module with no header beyond this line, decorators and an object literal.
import { helper } from "./four-space.ts";

const table = {
  add(a, b) {
    return a + b;
  },
  double(n) {
    return helper(n);
  },
};

@decorated
export class Small {
  run() {
    return table.double(2);
  }
}

export function* numbers() {
  yield 1;
}
