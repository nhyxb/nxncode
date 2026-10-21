export type ComposerToken = { kind: '/' | '@'; query: string; start: number; end: number }

export function composerToken(text: string, caret: number): ComposerToken | null {
 const before = text.slice(0, caret)
 // Commands inside fenced/inline code and escaped tokens remain ordinary text.
 if ((before.match(/```/g)?.length || 0) % 2 || (before.split('\n').at(-1)?.match(/`/g)?.length || 0) % 2) return null
 const match = /(?:^|[\s(])([/@])([^\s@`\\]*)$/u.exec(before)
 if (!match || match[2].includes('//') || match[1] === '/' && match[2].includes('/')) return null
 return { kind: match[1] as '/' | '@', query: match[2], start: caret - match[2].length - 1, end: caret }
}
