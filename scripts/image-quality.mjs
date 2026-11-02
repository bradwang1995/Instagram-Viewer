export const MIN_IMAGE_EDGE = 640;

export function imageDimensions(bytes) {
  if (
    bytes.length >= 24 &&
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (bytes[0] === 255 && bytes[1] === 216) {
    for (let i = 2; i + 3 < bytes.length;) {
      if (bytes[i++] !== 255) return;
      while (bytes[i] === 255) i++;
      const marker = bytes[i++];
      if (marker === 217 || marker === 218) return;
      if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
      if (i + 2 > bytes.length) return;
      const length = bytes.readUInt16BE(i);
      if (length < 2 || i + length > bytes.length) return;
      if (
        [
          192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207,
        ].includes(marker) &&
        length >= 7
      ) {
        return {
          width: bytes.readUInt16BE(i + 5),
          height: bytes.readUInt16BE(i + 3),
        };
      }
      i += length;
    }
  }
  if (
    bytes.length >= 20 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  ) {
    for (let i = 12; i + 8 <= bytes.length;) {
      const tag = bytes.toString("ascii", i, i + 4),
        length = bytes.readUInt32LE(i + 4),
        data = i + 8;
      if (data + length > bytes.length) return;
      if (tag === "VP8X" && length >= 10)
        return {
          width: bytes.readUIntLE(data + 4, 3) + 1,
          height: bytes.readUIntLE(data + 7, 3) + 1,
        };
      if (
        tag === "VP8 " &&
        length >= 10 &&
        bytes[data + 3] === 157 &&
        bytes[data + 4] === 1 &&
        bytes[data + 5] === 42
      )
        return {
          width: bytes.readUInt16LE(data + 6) & 16383,
          height: bytes.readUInt16LE(data + 8) & 16383,
        };
      if (tag === "VP8L" && length >= 5 && bytes[data] === 47) {
        const bits = bytes.readUInt32LE(data + 1);
        return {
          width: (bits & 16383) + 1,
          height: ((bits >>> 14) & 16383) + 1,
        };
      }
      i = data + length + (length % 2);
    }
  }
}

export function isLowResolution(size) {
  return (
    size?.width > 0 &&
    size?.height > 0 &&
    Math.max(size.width, size.height) < MIN_IMAGE_EDGE
  );
}
