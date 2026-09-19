# Edge cases

Quirks of the store.

## Concurrency

Writes from one process are serialised by the mutex. Two processes writing the same file will corrupt it.

## Atomic writes

`writeAll()` writes to a temp file and renames it, so readers never see a half-written file.
