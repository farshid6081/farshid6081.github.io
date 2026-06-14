"""One-off script to generate app icons (run once, output committed)."""
import struct
import zlib

GREEN = (0, 140, 69)
WHITE = (244, 245, 240)
RED = (205, 33, 42)
NAVY = (27, 58, 107)


def render(size):
    pixels = bytearray()
    third = size / 3.0
    cx, cy = size * 0.5, size * 0.40
    r_outer = size * 0.23
    r_inner = size * 0.095
    tip_y = size * 0.80

    for y in range(size):
        for x in range(size):
            # base: italian flag stripes
            if x < third:
                color = GREEN
            elif x < 2 * third:
                color = WHITE
            else:
                color = RED

            dx, dy = x - cx, y - cy
            dist = (dx * dx + dy * dy) ** 0.5

            in_circle = dist <= r_outer and dy <= 0
            in_triangle = False
            if 0 < dy <= (tip_y - cy):
                half_width = r_outer * (1 - dy / (tip_y - cy))
                if abs(dx) <= half_width:
                    in_triangle = True

            if in_circle or in_triangle:
                color = NAVY
                if in_circle and dist <= r_inner:
                    color = WHITE

            pixels += bytes(color) + b"\xff"
    return pixels


def write_png(filename, size, pixels):
    def chunk(tag, data):
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)

    raw = bytearray()
    stride = size * 4
    for y in range(size):
        raw += b"\x00"
        raw += pixels[y * stride:(y + 1) * stride]

    idat = zlib.compress(bytes(raw), 9)

    with open(filename, "wb") as f:
        f.write(sig)
        f.write(chunk(b"IHDR", ihdr))
        f.write(chunk(b"IDAT", idat))
        f.write(chunk(b"IEND", b""))


for size, name in [(512, "icon-512.png"), (192, "icon-192.png"), (180, "apple-touch-icon.png"), (32, "favicon-32.png")]:
    write_png(name, size, render(size))
    print("wrote", name)
