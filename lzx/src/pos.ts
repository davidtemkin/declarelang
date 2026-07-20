// pos — the byte/line/col position carried by every LZX node and gap.
export interface Pos {
  line: number;
  col: number;
  offset: number;
}
