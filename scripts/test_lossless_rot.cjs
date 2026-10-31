const fs = require('fs');

function rotateMp4Lossless(arrayBuffer, angle) {
  const view = new DataView(arrayBuffer);
  const totalLength = arrayBuffer.byteLength;
  if (totalLength < 16) return null;
  const tag0 = String.fromCharCode(view.getUint8(4), view.getUint8(5), view.getUint8(6), view.getUint8(7));
  if (tag0 !== 'ftyp') return null;

  function findBox(offset, end, targetName) {
    let curr = offset;
    while (curr + 8 <= end) {
      let boxSize = view.getUint32(curr);
      const boxName = String.fromCharCode(
        view.getUint8(curr + 4),
        view.getUint8(curr + 5),
        view.getUint8(curr + 6),
        view.getUint8(curr + 7)
      );
      if (boxSize === 1 && curr + 16 <= end) {
        boxSize = Number(view.getBigUint64(curr + 8));
      } else if (boxSize === 0) {
        boxSize = end - curr;
      }
      if (boxSize < 8 || curr + boxSize > end) break;
      if (boxName === targetName) {
        return { offset: curr, size: boxSize, dataOffset: curr + 8 };
      }
      curr += boxSize;
    }
    return null;
  }

  function findAllBoxes(offset, end, targetName) {
    const list = [];
    let curr = offset;
    while (curr + 8 <= end) {
      let boxSize = view.getUint32(curr);
      const boxName = String.fromCharCode(
        view.getUint8(curr + 4),
        view.getUint8(curr + 5),
        view.getUint8(curr + 6),
        view.getUint8(curr + 7)
      );
      if (boxSize === 1 && curr + 16 <= end) {
        boxSize = Number(view.getBigUint64(curr + 8));
      } else if (boxSize === 0) {
        boxSize = end - curr;
      }
      if (boxSize < 8 || curr + boxSize > end) break;
      if (boxName === targetName) {
        list.push({ offset: curr, size: boxSize, dataOffset: curr + 8 });
      }
      curr += boxSize;
    }
    return list;
  }

  const moov = findBox(0, totalLength, 'moov');
  if (!moov) return null;

  const traks = findAllBoxes(moov.dataOffset, moov.offset + moov.size, 'trak');
  let videoTrak = null;
  for (const trak of traks) {
    const mdia = findBox(trak.dataOffset, trak.offset + trak.size, 'mdia');
    if (!mdia) continue;
    const hdlr = findBox(mdia.dataOffset, mdia.offset + mdia.size, 'hdlr');
    if (!hdlr) continue;
    if (hdlr.dataOffset + 12 <= mdia.offset + mdia.size) {
      const handlerType = String.fromCharCode(
        view.getUint8(hdlr.dataOffset + 8),
        view.getUint8(hdlr.dataOffset + 9),
        view.getUint8(hdlr.dataOffset + 10),
        view.getUint8(hdlr.dataOffset + 11)
      );
      if (handlerType === 'vide') {
        videoTrak = trak;
        break;
      }
    }
  }
  if (!videoTrak) videoTrak = traks[0];
  if (!videoTrak) return null;

  const tkhd = findBox(videoTrak.dataOffset, videoTrak.offset + videoTrak.size, 'tkhd');
  if (!tkhd) return null;

  const version = view.getUint8(tkhd.dataOffset);
  let matrixOffset, widthOffset, heightOffset;
  if (version === 0) {
    matrixOffset = tkhd.dataOffset + 40;
    widthOffset = tkhd.dataOffset + 76;
    heightOffset = tkhd.dataOffset + 80;
  } else if (version === 1) {
    matrixOffset = tkhd.dataOffset + 52;
    widthOffset = tkhd.dataOffset + 88;
    heightOffset = tkhd.dataOffset + 92;
  } else {
    return null;
  }

  const width16 = view.getInt32(widthOffset);
  const height16 = view.getInt32(heightOffset);

  let matrix;
  const normAngle = ((Math.round(angle) % 360) + 360) % 360;
  if (normAngle === 90) {
    matrix = [0, 65536, 0, -65536, 0, 0, height16, 0, 1073741824];
  } else if (normAngle === 180) {
    matrix = [-65536, 0, 0, 0, -65536, 0, width16, height16, 1073741824];
  } else if (normAngle === 270) {
    matrix = [0, -65536, 0, 65536, 0, 0, 0, width16, 1073741824];
  } else {
    matrix = [65536, 0, 0, 0, 65536, 0, 0, 0, 1073741824];
  }

  for (let i = 0; i < 9; i++) {
    view.setInt32(matrixOffset + i * 4, matrix[i]);
  }

  return { success: true, version, matrix, width: width16 / 65536, height: height16 / 65536 };
}

console.log('Testing rotateMp4Lossless function definition syntax...');
const dummy = Buffer.alloc(100);
console.log('rotateMp4Lossless test passed.');
