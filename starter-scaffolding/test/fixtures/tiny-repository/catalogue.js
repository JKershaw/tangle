import { authors, books } from './data.js'

export function listBooks() {
  return books.map(book => ({
    ...book,
    author: authors.find(author => author.id === book.authorId) ?? null
  }))
}

