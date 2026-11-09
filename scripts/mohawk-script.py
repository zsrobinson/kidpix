"""Decode the drawing/wait/sound subset used by Easel's face animations.

This deliberately rejects unhandled commands rather than guessing their lengths.
The interval command uses milliseconds (verified against the i386 scheduler).
"""

import struct


def decode_script(data):
    if len(data) < 28:
        raise ValueError("Truncated tSCR header")
    collection, = struct.unpack_from(">H", data, 2)
    origin = struct.unpack_from(">hh", data, 16)
    events = []
    position = 26
    while position + 2 <= len(data):
        opcode, argument = data[position:position + 2]
        position += 2
        if opcode == 0x10:
            if not argument or position + argument * 6 > len(data):
                raise ValueError("Truncated or empty tSCR image group")
            images = [struct.unpack_from(">Hhh", data, position + index * 6) for index in range(argument)]
            events.append({"op": "draw", "images": images})
            position += argument * 6
        elif (opcode, argument) == (0x04, 0x04):
            if position + 2 > len(data):
                raise ValueError("Truncated tSCR interval")
            interval, = struct.unpack_from(">H", data, position)
            if not interval:
                raise ValueError("Zero tSCR interval is not supported")
            events.append({"op": "interval", "ms": interval})
            position += 2
        elif (opcode, argument) == (0x01, 0x02):
            event = {"op": "wait"}
            # The native interpreter does not yield on a wait immediately
            # followed by end; it completes in the current update.
            if data[position:position + 2] == b"\x00\x02":
                event["terminal"] = True
            events.append(event)
        elif (opcode, argument) == (0x03, 0x06):
            if position + 4 > len(data):
                raise ValueError("Truncated tSCR sound cue")
            cue, channel = struct.unpack_from(">HH", data, position)
            events.append({"op": "sound", "cue": cue, "channel": channel})
            position += 4
        elif (opcode, argument) == (0x00, 0x02):
            if position != len(data):
                raise ValueError("Trailing data after tSCR end")
            return {"collection": collection, "origin": origin, "events": events}
        else:
            raise ValueError(f"Unsupported tSCR command {opcode:02x}{argument:02x} at {position - 2}")
    raise ValueError("Missing tSCR end command")
