export type CreditRole = 'title' | 'name' | 'line' | 'handle' | 'studio';

export interface CreditLine {
  readonly role: CreditRole;
  readonly text: string;
}

/**
 * The complete credits, exactly as supplied by the author. Blocks are separated by generous
 * space in the roll; do not add contributors, roles or links here without the author.
 */
export const CREDIT_BLOCKS: ReadonlyArray<readonly CreditLine[]> = [
  [{ role: 'title', text: 'VÉRTICE' }],
  [
    { role: 'name', text: 'jeanvicen' },
    { role: 'line', text: 'Jean Carlos de Souza Vicente' },
    { role: 'handle', text: 'Instagram: 0neajx' },
  ],
  [{ role: 'studio', text: 'Klipza Studio' }],
];
