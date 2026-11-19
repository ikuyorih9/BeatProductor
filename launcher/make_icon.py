"""Gera launcher/icon.ico (mesmo desenho do favicon) usando só a biblioteca padrão.

O .ico contém imagens PNG em 16, 32, 48 e 256 px (formato aceito desde o Windows Vista).
Uso:  python launcher/make_icon.py
"""

import struct
import zlib
from pathlib import Path

BACKGROUND = (15, 23, 42, 255)  # #0f172a
BARS = [  # (x, y, largura, altura, cor) na grade 32×32 do favicon
    (6, 8, 8, 4, (56, 189, 248, 255)),    # azul  (piano)
    (12, 14, 12, 4, (167, 139, 250, 255)),  # roxo  (lofi)
    (8, 20, 6, 4, (249, 115, 22, 255)),   # laranja (bateria)
]


def inside_rounded(x: float, y: float, size: float, radius: float) -> bool:
    cx = min(max(x, radius), size - radius)
    cy = min(max(y, radius), size - radius)
    return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2


def render(size: int) -> bytes:
    scale = size / 32
    rows = []
    for py in range(size):
        row = bytearray([0])  # filtro PNG "None"
        for px in range(size):
            x, y = (px + 0.5) / scale, (py + 0.5) / scale
            color = (0, 0, 0, 0)
            if inside_rounded(x, y, 32, 6):
                color = BACKGROUND
                for bx, by, bw, bh, bar_color in BARS:
                    if bx <= x < bx + bw and by <= y < by + bh:
                        color = bar_color
            row.extend(color)
        rows.append(bytes(row))
    return png(size, b"".join(rows))


def png(size: int, raw: bytes) -> bytes:
    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    header = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)  # 8 bits, RGBA
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")


def ico(images: list[tuple[int, bytes]]) -> bytes:
    header = struct.pack("<HHH", 0, 1, len(images))
    offset = 6 + 16 * len(images)
    entries, blobs = b"", b""
    for size, data in images:
        dim = 0 if size >= 256 else size
        entries += struct.pack("<BBBBHHII", dim, dim, 0, 0, 1, 32, len(data), offset)
        blobs += data
        offset += len(data)
    return header + entries + blobs


if __name__ == "__main__":
    out = Path(__file__).with_name("icon.ico")
    out.write_bytes(ico([(s, render(s)) for s in (16, 32, 48, 256)]))
    print(f"OK: {out}")
