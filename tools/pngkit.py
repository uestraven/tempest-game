#!/usr/bin/env python3
"""Dependency-free PNG crop / zoom / diff, for inspecting engine captures.

Only the standard library is used, so this runs anywhere Python 3 does and adds
no dependency to the project. Run with -I.

    python3 -I tools/pngkit.py zoom  IN OUT X Y W H SCALE
    python3 -I tools/pngkit.py diff  A B OUT        # writes a difference mask
    python3 -I tools/pngkit.py equal A B            # exit 0 if byte-equal pixels
    python3 -I tools/pngkit.py rect  IN X Y W H     # report opaque pixels in a rect

This is an inspection aid. It never writes to public/ or art-source/, and the
automated pixel-preservation assertions live in the vitest suite against the
engine's own texture frames, not here.
"""

import struct
import sys
import zlib


def read_png(path):
    data = open(path, 'rb').read()
    if data[:8] != b'\x89PNG\r\n\x1a\n':
        raise SystemExit(f'{path}: not a PNG')
    pos = 8
    w = h = depth = color = None
    idat = bytearray()
    palette = None
    trns = None
    while pos < len(data):
        (length,) = struct.unpack('>I', data[pos:pos + 4])
        ctype = data[pos + 4:pos + 8]
        body = data[pos + 8:pos + 8 + length]
        if ctype == b'IHDR':
            w, h, depth, color = struct.unpack('>IIBB', body[:10])
        elif ctype == b'PLTE':
            palette = body
        elif ctype == b'tRNS':
            trns = body
        elif ctype == b'IDAT':
            idat += body
        elif ctype == b'IEND':
            break
        pos += 12 + length
    if depth != 8:
        raise SystemExit(f'{path}: only 8-bit PNGs supported (got {depth})')
    channels = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[color]
    raw = zlib.decompress(bytes(idat))
    stride = w * channels
    out = bytearray(stride * h)
    prev = bytearray(stride)
    p = 0
    for y in range(h):
        filt = raw[p]
        p += 1
        line = bytearray(raw[p:p + stride])
        p += stride
        if filt == 1:
            for i in range(channels, stride):
                line[i] = (line[i] + line[i - channels]) & 0xFF
        elif filt == 2:
            for i in range(stride):
                line[i] = (line[i] + prev[i]) & 0xFF
        elif filt == 3:
            for i in range(stride):
                a = line[i - channels] if i >= channels else 0
                line[i] = (line[i] + ((a + prev[i]) >> 1)) & 0xFF
        elif filt == 4:
            for i in range(stride):
                a = line[i - channels] if i >= channels else 0
                b = prev[i]
                c = prev[i - channels] if i >= channels else 0
                pa, pb, pc = abs(b - c), abs(a - c), abs(a + b - 2 * c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[i] = (line[i] + pr) & 0xFF
        elif filt != 0:
            raise SystemExit(f'{path}: bad filter {filt}')
        out[y * stride:(y + 1) * stride] = line
        prev = line
    # normalise to RGBA
    px = bytearray(w * h * 4)
    for i in range(w * h):
        if color == 6:
            px[i * 4:i * 4 + 4] = out[i * 4:i * 4 + 4]
        elif color == 2:
            px[i * 4:i * 4 + 3] = out[i * 3:i * 3 + 3]
            px[i * 4 + 3] = 255
        elif color == 0:
            g = out[i]
            px[i * 4:i * 4 + 4] = bytes((g, g, g, 255))
        elif color == 4:
            g = out[i * 2]
            px[i * 4:i * 4 + 4] = bytes((g, g, g, out[i * 2 + 1]))
        elif color == 3:
            idx = out[i]
            px[i * 4:i * 4 + 3] = palette[idx * 3:idx * 3 + 3]
            a = 255
            if trns is not None and idx < len(trns):
                a = trns[idx]
            px[i * 4 + 3] = a
    return w, h, px


def write_png(path, w, h, px):
    raw = bytearray()
    for y in range(h):
        raw.append(0)
        raw += px[y * w * 4:(y + 1) * w * 4]
    def chunk(t, b):
        c = struct.pack('>I', len(b)) + t + b
        return c + struct.pack('>I', zlib.crc32(t + b) & 0xFFFFFFFF)
    out = b'\x89PNG\r\n\x1a\n'
    out += chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
    out += chunk(b'IDAT', zlib.compress(bytes(raw), 9))
    out += chunk(b'IEND', b'')
    open(path, 'wb').write(out)


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else ''
    if cmd == 'zoom':
        src, dst, x, y, cw, ch, s = sys.argv[2], sys.argv[3], *map(int, sys.argv[4:9])
        w, h, px = read_png(src)
        ow, oh = cw * s, ch * s
        out = bytearray(ow * oh * 4)
        for j in range(oh):
            sy = y + j // s
            for i in range(ow):
                sx = x + i // s
                if 0 <= sx < w and 0 <= sy < h:
                    o = (sy * w + sx) * 4
                    out[(j * ow + i) * 4:(j * ow + i) * 4 + 4] = px[o:o + 4]
        write_png(dst, ow, oh, out)
        print(f'{dst} {ow}x{oh} from {src} rect ({x},{y},{cw},{ch}) x{s}')
    elif cmd == 'sbs':
        # sbs A B OUT X Y W H SCALE  -> same crop from both, side by side
        a, b, dst = sys.argv[2], sys.argv[3], sys.argv[4]
        x, y, cw, ch, s = map(int, sys.argv[5:10])
        aw, ah, ap = read_png(a)
        bw, bh, bp = read_png(b)
        gap = 4
        ow, oh = cw * s * 2 + gap, ch * s
        out = bytearray(b'\x00' * (ow * oh * 4))
        for src_w, src_h, src_px, x_off in ((aw, ah, ap, 0), (bw, bh, bp, cw * s + gap)):
            for j in range(ch * s):
                sy = y + j // s
                for i in range(cw * s):
                    sx = x + i // s
                    if 0 <= sx < src_w and 0 <= sy < src_h:
                        o = (sy * src_w + sx) * 4
                        d = (j * ow + i + x_off) * 4
                        out[d:d + 4] = src_px[o:o + 4]
        for j in range(oh):
            for i in range(cw * s, cw * s + gap):
                d = (j * ow + i) * 4
                out[d:d + 4] = bytes((255, 0, 255, 255))
        write_png(dst, ow, oh, out)
        print(f'{dst} {ow}x{oh}  left={a}  right={b}  rect=({x},{y},{cw},{ch}) x{s}')
    elif cmd in ('diff', 'equal'):
        aw, ah, ap = read_png(sys.argv[2])
        bw, bh, bp = read_png(sys.argv[3])
        if (aw, ah) != (bw, bh):
            print(f'DIFFERENT SIZE {aw}x{ah} vs {bw}x{bh}')
            sys.exit(1)
        diff = [i for i in range(aw * ah) if ap[i * 4:i * 4 + 4] != bp[i * 4:i * 4 + 4]]
        if cmd == 'equal':
            print(f'{len(diff)} differing pixels of {aw*ah}')
            sys.exit(0 if not diff else 1)
        out = bytearray(aw * ah * 4)
        for i in range(aw * ah):
            if i in set(diff):
                out[i * 4:i * 4 + 4] = bytes((255, 0, 255, 255))
            else:
                g = (ap[i * 4] * 3 + ap[i * 4 + 1] * 6 + ap[i * 4 + 2]) // 10 // 3
                out[i * 4:i * 4 + 4] = bytes((g, g, g, 255))
        write_png(sys.argv[4], aw, ah, out)
        xs = [i % aw for i in diff]
        ys = [i // aw for i in diff]
        print(f'{len(diff)} differing pixels')
        if diff:
            print(f'bbox x {min(xs)}..{max(xs)}  y {min(ys)}..{max(ys)}')
    elif cmd == 'rect':
        src = sys.argv[2]
        x, y, cw, ch = map(int, sys.argv[3:7])
        w, h, px = read_png(src)
        opaque = 0
        colors = set()
        partial = 0
        for j in range(y, min(y + ch, h)):
            for i in range(x, min(x + cw, w)):
                o = (j * w + i) * 4
                a = px[o + 3]
                if a == 255:
                    opaque += 1
                    colors.add(bytes(px[o:o + 3]))
                elif a:
                    partial += 1
        print(f'{src} rect ({x},{y},{cw},{ch}): opaque={opaque} partialAlpha={partial} uniqueRGB={len(colors)}')
    else:
        print(__doc__)
        sys.exit(2)


if __name__ == '__main__':
    main()
