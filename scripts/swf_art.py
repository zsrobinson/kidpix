"""Translate the original Kid Pix vector artwork and animation timelines to SVG."""

from collections import defaultdict
from dataclasses import dataclass, replace
import math
import struct
import zlib


class Bits:
    def __init__(self, data):
        self.data = data
        self.bit = 0

    @property
    def position(self):
        return (self.bit + 7) // 8

    def align(self):
        self.bit = self.position * 8

    def read(self, size, *, signed=False):
        value = 0
        remaining = size
        while remaining:
            offset = self.bit % 8
            take = min(8 - offset, remaining)
            current = self.data[self.bit // 8]
            value = (value << take) | (current >> (8 - offset - take) & ((1 << take) - 1))
            self.bit += take
            remaining -= take
        if signed and size and value >> (size - 1):
            value -= 1 << size
        return value

    def take(self, count):
        start = self.position
        self.bit = (start + count) * 8
        if self.position > len(self.data):
            raise ValueError("Truncated SWF data")
        return self.data[start:self.position]

    def byte(self):
        return self.take(1)[0]

    def u16(self):
        return int.from_bytes(self.take(2), "little")

    def rect(self):
        self.align()
        width = self.read(5)
        values = tuple(self.read(width, signed=True) for _ in range(4))
        self.align()
        return values

    def matrix(self):
        self.align()
        a = d = 1
        b = c = 0
        if self.read(1):
            width = self.read(5)
            a, d = (self.read(width, signed=True) / 65536 for _ in range(2))
        if self.read(1):
            width = self.read(5)
            b, c = (self.read(width, signed=True) / 65536 for _ in range(2))
        width = self.read(5)
        x, y = (self.read(width, signed=True) for _ in range(2))
        self.align()
        return a, b, c, d, x, y

    def transform(self, *, alpha):
        self.align()
        add, multiply, width = self.read(1), self.read(1), self.read(4)
        channels = 4 if alpha else 3
        slope = tuple(self.read(width, signed=True) / 256 for _ in range(channels)) if multiply else (1,) * channels
        offset = tuple(self.read(width, signed=True) / 255 for _ in range(channels)) if add else (0,) * channels
        self.align()
        if not alpha:
            slope += (1,)
            offset += (0,)
        return slope, offset


def number(value):
    return f"{value:.7g}"


def matrix(values):
    return f'matrix({" ".join(number(value) for value in values)})'


def color(rgb):
    return "#" + rgb.hex()


def count(reader):
    value = reader.byte()
    return reader.u16() if value == 255 else value


def read_fill(reader, gradients):
    kind = reader.byte()
    if kind == 0:
        return color(reader.take(3))
    if kind not in (0x10, 0x12):
        raise ValueError(f"Unsupported SWF fill type {kind:#x}")
    transform = matrix(reader.matrix())
    stop_count = reader.byte() & 0xF
    gradient_id = f"gradient{len(gradients)}"
    if kind == 0x10:
        element = "linearGradient"
        attrs = 'x1="-16384" x2="16384" y1="0" y2="0"'
    else:
        element = "radialGradient"
        attrs = 'cx="0" cy="0" r="16384"'
    stops = []
    for _ in range(stop_count):
        offset = number(reader.byte() / 255)
        rgb = color(reader.take(3))
        stops.append(f'<stop offset="{offset}" stop-color="{rgb}"/>')
    gradients.append(
        f'<{element} id="{gradient_id}" gradientUnits="userSpaceOnUse" gradientTransform="{transform}" {attrs}>'
        f'{"".join(stops)}</{element}>'
    )
    return f"url(#{gradient_id})"


def read_styles(reader, gradients):
    fills = [read_fill(reader, gradients) for _ in range(count(reader))]
    lines = [(reader.u16(), color(reader.take(3))) for _ in range(count(reader))]
    return fills, lines


def path_data(edges, *, close):
    """Join separately encoded edges into complete contours for one style."""
    outgoing = defaultdict(list)
    remaining = dict(enumerate(edges))
    for index, (start, _, _) in remaining.items():
        outgoing[start].append(index)
    paths = []
    for index in range(len(edges)):
        if index not in remaining:
            continue
        start, control, end = remaining.pop(index)
        paths.append(f"M{start[0]} {start[1]}")
        while True:
            if control is None:
                paths.append(f"L{end[0]} {end[1]}")
            else:
                paths.append(f"Q{control[0]} {control[1]} {end[0]} {end[1]}")
            if end == start:
                if close:
                    paths.append("Z")
                break
            choices = outgoing[end]
            while choices and choices[-1] not in remaining:
                choices.pop()
            if not choices:
                break
            _, control, end = remaining.pop(choices.pop())
    return "".join(paths)


def read_shape(reader, gradients, *, glyph=False):
    if glyph:
        fills, lines = ["currentColor"], []
    else:
        fills, lines = read_styles(reader, gradients)
    fill_bits, line_bits = reader.read(4), reader.read(4)
    fill_zero = fill_one = line = 0
    fill_base = line_base = 0
    x = y = 0
    fill_edges = defaultdict(list)
    line_edges = defaultdict(list)
    while True:
        if not reader.read(1):
            flags = reader.read(5)
            if not flags:
                break
            if flags & 1:
                width = reader.read(5)
                x, y = (reader.read(width, signed=True) for _ in range(2))
            if flags & 2:
                index = reader.read(fill_bits)
                fill_zero = fill_base + index if index else 0
            if flags & 4:
                index = reader.read(fill_bits)
                fill_one = fill_base + index if index else 0
            if flags & 8:
                index = reader.read(line_bits)
                line = line_base + index if index else 0
            if flags & 16:
                reader.align()
                fill_base, line_base = len(fills), len(lines)
                next_fills, next_lines = read_styles(reader, gradients)
                fills.extend(next_fills)
                lines.extend(next_lines)
                fill_bits, line_bits = reader.read(4), reader.read(4)
            continue

        start = (x, y)
        straight = reader.read(1)
        width = reader.read(4) + 2
        control = None
        if straight:
            if reader.read(1):
                x += reader.read(width, signed=True)
                y += reader.read(width, signed=True)
            elif reader.read(1):
                y += reader.read(width, signed=True)
            else:
                x += reader.read(width, signed=True)
        else:
            cx = x + reader.read(width, signed=True)
            cy = y + reader.read(width, signed=True)
            x = cx + reader.read(width, signed=True)
            y = cy + reader.read(width, signed=True)
            control = (cx, cy)
        end = (x, y)
        if fill_zero:
            fill_edges[fill_zero].append((start, control, end))
        if fill_one:
            fill_edges[fill_one].append((end, control, start))
        if line:
            line_edges[line].append((start, control, end))

    paths = []
    for style, edges in sorted(fill_edges.items()):
        shape = path_data(edges, close=True)
        paths.append(f'<path fill="{fills[style - 1]}" fill-rule="evenodd" d="{shape}"/>')
    for style, edges in sorted(line_edges.items()):
        width, rgb = lines[style - 1]
        shape = path_data(edges, close=False)
        paths.append(
            f'<path fill="none" stroke="{rgb}" stroke-width="{max(width, 1)}" '
            f'stroke-linecap="round" stroke-linejoin="round" d="{shape}"/>'
        )
    return "".join(paths)


@dataclass(frozen=True)
class Placement:
    character: int
    transform: tuple = (1, 0, 0, 1, 0, 0)
    colors: tuple | None = None


def place(reader, display, *, legacy):
    if legacy:
        character = reader.u16()
        depth = reader.u16()
        placement = Placement(character, reader.matrix())
        if reader.position < len(reader.data):
            placement = replace(placement, colors=reader.transform(alpha=False))
    else:
        flags = reader.byte()
        depth = reader.u16()
        placement = display.get(depth) if flags & 1 else None
        placement = placement or Placement(0)
        if flags & 2:
            placement = replace(placement, character=reader.u16())
        if flags & 4:
            placement = replace(placement, transform=reader.matrix())
        if flags & 8:
            placement = replace(placement, colors=reader.transform(alpha=True))
        if flags & 0x40:
            raise ValueError("Unsupported SWF mask placement")
    display[depth] = placement


def read_font(reader, definitions):
    font = reader.u16()
    table = reader.position
    first = reader.u16()
    offsets = (first, *(reader.u16() for _ in range(first // 2 - 1)))
    for index, offset in enumerate(offsets):
        reader.bit = (table + offset) * 8
        definitions[f"font{font}-{index}"] = read_shape(reader, [], glyph=True)


def read_text(reader):
    reader.rect()
    transform = matrix(reader.matrix())
    glyph_bits, advance_bits = reader.byte(), reader.byte()
    x = y = 0
    font = height = 0
    rgb = "#000000"
    output = []
    while True:
        flags = reader.byte()
        if not flags:
            break
        if flags & 0x80:
            if flags & 8:
                font = reader.u16()
            if flags & 4:
                rgb = color(reader.take(3))
            if flags & 1:
                x = int.from_bytes(reader.take(2), "little", signed=True)
            if flags & 2:
                y = int.from_bytes(reader.take(2), "little", signed=True)
            if flags & 8:
                height = reader.u16()
        else:
            scale = number(height / 1024)
            for _ in range(flags):
                glyph = reader.read(glyph_bits)
                advance = reader.read(advance_bits, signed=True)
                output.append(
                    f'<use href="#font{font}-{glyph}" color="{rgb}" '
                    f'transform="translate({x} {y}) scale({scale})"/>'
                )
                x += advance
            reader.align()
    return f'<g transform="{transform}">{"".join(output)}</g>'


def parse(data):
    if data[:3] == b"CWS":
        data = b"FWS" + data[3:8] + zlib.decompress(data[8:])
    if data[:3] != b"FWS":
        raise ValueError("Invalid SWF signature")
    reader = Bits(data)
    reader.take(8)
    bounds = reader.rect()
    rate = reader.u16() / 256
    reader.u16()
    definitions = {}
    gradients = []
    display = {}
    frames = []
    while reader.position + 2 <= len(data):
        header = reader.u16()
        tag, size = header >> 6, header & 63
        if size == 63:
            size = int.from_bytes(reader.take(4), "little")
        record = Bits(reader.take(size))
        if tag == 0:
            break
        if tag == 1:
            frames.append(tuple(placement for _, placement in sorted(display.items())))
        elif tag in (2, 22):
            character = record.u16()
            record.rect()
            definitions[f"character{character}"] = read_shape(record, gradients)
        elif tag in (4, 26):
            place(record, display, legacy=tag == 4)
        elif tag in (5, 28):
            if tag == 5:
                record.u16()
            display.pop(record.u16(), None)
        elif tag == 10:
            read_font(record, definitions)
        elif tag == 11:
            character = record.u16()
            definitions[f"character{character}"] = read_text(record)
        elif tag not in (9, 13):
            raise ValueError(f"Unsupported SWF tag {tag}")

    if not frames or not rate:
        raise ValueError("Missing SWF timeline")
    return bounds, rate, definitions, gradients, frames


def render(bounds, rate, definitions, gradients, frames):
    x1, x2, y1, y2 = bounds
    width = math.ceil((x2 - x1) / 20)
    height = math.ceil((y2 - y1) / 20)
    if width <= 0 or height <= 0:
        raise ValueError("Invalid SWF stage bounds")

    filters = {}
    content = []
    used_characters = set()
    for index, frame in enumerate(frames):
        placements = []
        for placement in frame:
            character = f"character{placement.character}"
            if character not in definitions:
                raise ValueError(f"Undefined SWF character {placement.character}")
            used_characters.add(character)
            effect = ""
            if placement.colors is not None:
                filter_id = filters.setdefault(placement.colors, f"color{len(filters)}")
                effect = f' filter="url(#{filter_id})"'
            placements.append(f'<use href="#{character}" transform="{matrix(placement.transform)}"{effect}/>')
        if len(frames) > 1:
            start = number(index / len(frames))
            end = number((index + 1) / len(frames))
            duration = number(len(frames) / rate)
            if index == 0:
                times, values = f"0;{end};1", "visible;hidden;hidden"
            elif index == len(frames) - 1:
                times, values = f"0;{start};1", "hidden;visible;visible"
            else:
                times, values = f"0;{start};{end};1", "hidden;visible;hidden;hidden"
            visible = "visible" if index == 0 else "hidden"
            content.append(
                f'<g visibility="{visible}"><animate attributeName="visibility" calcMode="discrete" '
                f'dur="{duration}s" repeatCount="indefinite" keyTimes="{times}" values="{values}"/>'
                f'{"".join(placements)}</g>'
            )
        else:
            content.extend(placements)

    defs = list(gradients)
    for key, shape in definitions.items():
        if key in used_characters or key.startswith("font"):
            defs.append(f'<g id="{key}">{shape}</g>')
    for (slopes, offsets), filter_id in filters.items():
        functions = "".join(
            f'<feFunc{channel} type="linear" slope="{number(slope)}" intercept="{number(offset)}"/>'
            for channel, slope, offset in zip("RGBA", slopes, offsets)
        )
        defs.append(
            f'<filter id="{filter_id}" color-interpolation-filters="sRGB" x="0" y="0" width="100%" height="100%">'
            f'<feComponentTransfer>{functions}</feComponentTransfer></filter>'
        )
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="{x1} {y1} {x2 - x1} {y2 - y1}"><defs>{"".join(defs)}</defs>'
        f'{"".join(content)}</svg>'
    )
    return svg.encode(), width, height


def convert(data):
    bounds, rate, definitions, gradients, frames = parse(data)
    still, width, height = render(bounds, rate, definitions, gradients, frames[:1])
    animation = None
    if len(frames) > 1:
        animation, _, _ = render(bounds, rate, definitions, gradients, frames)
    return still, animation, width, height
