// Minimal inflate for deflate streams (RFC 1951) — enough for PNG IDAT chunks

export function inflate(data: Uint8Array): Uint8Array {
  const output: number[] = [];
  let pos = 0;
  let bpos = 0;
  let bitbuf = 0;
  let bitcnt = 0;

  function readBits(n: number): number {
    while (bitcnt < n) {
      if (pos >= data.length) return -1;
      bitbuf |= data[pos++] << bitcnt;
      bitcnt += 8;
    }
    const val = bitbuf & ((1 << n) - 1);
    bitbuf >>>= n;
    bitcnt -= n;
    return val;
  }

  function readByte(): number {
    if (bitcnt >= 8) {
      // drain bits
      const rem = bitcnt & 7;
      bitbuf >>>= rem;
      bitcnt -= rem;
    }
    if (pos >= data.length) return -1;
    return data[pos++];
  }

  // Build decode tree from code lengths
  function buildTree(lengths: number[], maxBits: number) {
    // Count frequencies
    const blCount = new Array(maxBits + 1).fill(0);
    for (const len of lengths) blCount[len]++;
    // Compute codes
    const nextCode = new Array(maxBits + 1).fill(0);
    let code = 0;
    for (let bits = 1; bits <= maxBits; bits++) {
      code = (code + blCount[bits - 1]) << 1;
      nextCode[bits] = code;
    }
    // Assign codes to symbols
    const codes: Record<number, { bits: number; val: number }> = {};
    for (let i = 0; i < lengths.length; i++) {
      if (lengths[i] > 0) {
        codes[nextCode[lengths[i]]] = { bits: lengths[i], val: i };
      }
    }
    return codes;
  }

  // Fixed Huffman codes for lit/len
  const fixedLitLengths: number[] = [];
  for (let i = 0; i <= 143; i++) fixedLitLengths.push(8);
  for (let i = 144; i <= 255; i++) fixedLitLengths.push(9);
  for (let i = 256; i <= 279; i++) fixedLitLengths.push(7);
  for (let i = 280; i <= 287; i++) fixedLitLengths.push(8);

  // Fixed Huffman codes for dist
  const fixedDistLengths: number[] = new Array(32).fill(5);

  // Order for dynamic Huffman code lengths
  const clenOrder = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

  while (pos < data.length || bitcnt > 0) {
    const bfinal = readBits(1);
    const btype = readBits(2);

    if (btype === 0) {
      // Stored
      if (bitcnt >= 8) {
        const rem = bitcnt & 7;
        bitbuf >>>= rem;
        bitcnt -= rem;
      }
      const len = readByte() | (readByte() << 8);
      const nlen = readByte() | (readByte() << 8);
      if (len !== (nlen ^ 0xffff)) break;
      for (let i = 0; i < len; i++) {
        const b = readByte();
        if (b === -1) break;
        output.push(b);
      }
    } else {
      let litTree: Record<number, { bits: number; val: number }>;
      let distTree: Record<number, { bits: number; val: number }>;

      if (btype === 1) {
        // Fixed Huffman
        litTree = buildTree(fixedLitLengths, 9);
        distTree = buildTree(fixedDistLengths, 5);
      } else {
        // Dynamic Huffman
        const hlit = readBits(5) + 257;
        const hdist = readBits(5) + 1;
        const hclen = readBits(4) + 4;

        const clenLens = new Array(19).fill(0);
        for (let i = 0; i < hclen; i++) {
          clenLens[clenOrder[i]] = readBits(3);
        }
        const clenTree = buildTree(clenLens, 3);

        // Decode code lengths
        const allLens: number[] = [];
        let total = hlit + hdist;
        while (allLens.length < total) {
          let sym = decodeSymbol(readBits, clenTree);
          if (sym === -1) break;
          if (sym < 16) {
            allLens.push(sym);
          } else if (sym === 16) {
            const rep = readBits(2) + 3;
            const last = allLens[allLens.length - 1] || 0;
            for (let i = 0; i < rep; i++) allLens.push(last);
          } else if (sym === 17) {
            const rep = readBits(3) + 3;
            for (let i = 0; i < rep; i++) allLens.push(0);
          } else if (sym === 18) {
            const rep = readBits(7) + 11;
            for (let i = 0; i < rep; i++) allLens.push(0);
          }
        }

        const litLens = allLens.slice(0, hlit);
        const distLens = allLens.slice(hlit);

        litTree = buildTree(litLens, 15);
        distTree = buildTree(distLens, 15);
      }

      // Decode block
      while (true) {
        const lit = decodeSymbol(readBits, litTree);
        if (lit === -1 || lit === 256) break;
        if (lit < 256) {
          output.push(lit);
        } else {
          // Length
          let len: number;
          if (lit <= 264) len = lit - 254;
          else if (lit <= 268) len = 11 + (lit - 265) * 2 + readBits(1);
          else if (lit <= 272) len = 19 + (lit - 269) * 4 + readBits(2);
          else if (lit <= 276) len = 35 + (lit - 273) * 8 + readBits(3);
          else if (lit <= 280) len = 67 + (lit - 277) * 16 + readBits(4);
          else if (lit <= 284) len = 131 + (lit - 281) * 32 + readBits(5);
          else if (lit === 285) len = 258;
          else break;

          // Distance
          const distSym = decodeSymbol(readBits, distTree);
          if (distSym === -1) break;
          let dist: number;
          if (distSym <= 3) dist = distSym + 1;
          else if (distSym <= 29) {
            const extra = (distSym - 2) >> 1;
            dist = (1 + (distSym & 1)) << extra;
            dist += readBits(extra);
          } else break;

          for (let i = 0; i < len; i++) {
            const idx = output.length - dist;
            output.push(idx >= 0 ? output[idx] : 0);
          }
        }
      }
    }

    if (bfinal) break;
  }

  return new Uint8Array(output);
}

function decodeSymbol(readBits: (n: number) => number, tree: Record<number, { bits: number; val: number }>): number {
  // Try each bit length
  let code = 0;
  let bits = 0;
  for (let maxBits = 1; maxBits <= 15; maxBits++) {
    const bit = readBits(1);
    if (bit === -1) return -1;
    code = (code << 1) | bit;
    bits++;
    if (tree[code] && tree[code].bits === bits) {
      return tree[code].val;
    }
  }
  return -1;
}
